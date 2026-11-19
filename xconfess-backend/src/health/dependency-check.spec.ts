import {
  buildDependencyDetail,
  classifyDependencyError,
  DEFAULT_DEPENDENCY_TIMEOUT_MS,
  DependencyTimeoutError,
  MAX_DEPENDENCY_TIMEOUT_MS,
  MIN_DEPENDENCY_TIMEOUT_MS,
  resolveDependencyTimeoutMs,
  summarizeDependencyError,
  withDependencyTimeout,
} from './dependency-check';

const config = (values: Record<string, unknown>) => ({
  get: <T>(key: string) => values[key] as T | undefined,
});

describe('dependency-check', () => {
  describe('resolveDependencyTimeoutMs', () => {
    it('defaults to the shared default', () => {
      expect(resolveDependencyTimeoutMs(config({}), 'database')).toBe(
        DEFAULT_DEPENDENCY_TIMEOUT_MS,
      );
      expect(resolveDependencyTimeoutMs(undefined, 'redis')).toBe(
        DEFAULT_DEPENDENCY_TIMEOUT_MS,
      );
    });

    it('prefers the dependency-specific value over the shared one', () => {
      const values = config({
        HEALTH_CHECK_TIMEOUT_MS: '1500',
        HEALTH_REDIS_TIMEOUT_MS: '750',
      });
      expect(resolveDependencyTimeoutMs(values, 'redis')).toBe(750);
      expect(resolveDependencyTimeoutMs(values, 'queues')).toBe(1500);
    });

    it('clamps out-of-range values and ignores garbage', () => {
      expect(
        resolveDependencyTimeoutMs(config({ HEALTH_CHECK_TIMEOUT_MS: 1 }), 'schema'),
      ).toBe(MIN_DEPENDENCY_TIMEOUT_MS);
      expect(
        resolveDependencyTimeoutMs(
          config({ HEALTH_CHECK_TIMEOUT_MS: 10_000_000 }),
          'schema',
        ),
      ).toBe(MAX_DEPENDENCY_TIMEOUT_MS);
      expect(
        resolveDependencyTimeoutMs(
          config({ HEALTH_CHECK_TIMEOUT_MS: 'abc', HEALTH_SCHEMA_TIMEOUT_MS: -5 }),
          'schema',
        ),
      ).toBe(DEFAULT_DEPENDENCY_TIMEOUT_MS);
    });
  });

  describe('withDependencyTimeout', () => {
    it('resolves with the operation result', async () => {
      await expect(
        withDependencyTimeout('database', 100, async () => 42),
      ).resolves.toBe(42);
    });

    it('rejects with DependencyTimeoutError when the operation hangs', async () => {
      const error = await withDependencyTimeout(
        'redis',
        100,
        () => new Promise(() => undefined),
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DependencyTimeoutError);
      expect(error).toMatchObject({ dependency: 'redis', timeoutMs: 100 });
      expect(classifyDependencyError(error)).toBe('TIMEOUT');
    });

    it('propagates operation errors unchanged', async () => {
      const boom = new Error('boom');
      await expect(
        withDependencyTimeout('queues', 100, async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);
    });
  });

  describe('classifyDependencyError', () => {
    it.each([
      ['connect ECONNREFUSED 127.0.0.1:5432', 'CONNECTION_REFUSED'],
      ['getaddrinfo ENOTFOUND db.internal', 'DNS_LOOKUP_FAILED'],
      ['password authentication failed for user "x"', 'AUTH_FAILED'],
      ['NOAUTH Authentication required.', 'AUTH_FAILED'],
      ['sorry, too many connections', 'RESOURCE_EXHAUSTED'],
      ['Connection terminated due to connection timeout', 'TIMEOUT'],
      ['The server does not support SSL connections', 'TLS_FAILED'],
      ['something odd', 'UNKNOWN'],
    ])('classifies %p as %p', (message, code) => {
      expect(classifyDependencyError(new Error(message))).toBe(code);
    });

    it('summaries never echo the driver message', () => {
      const code = classifyDependencyError(
        new Error('connect ECONNREFUSED 10.1.2.3:6379'),
      );
      expect(summarizeDependencyError(code)).toBe('connection refused');
    });
  });

  describe('buildDependencyDetail', () => {
    const now = new Date('2026-11-19T00:00:00.000Z');

    it('builds the documented envelope', () => {
      expect(
        buildDependencyDetail({
          dependency: 'database',
          state: 'up',
          timeoutMs: 3000,
          latencyMs: 4,
          message: 'ok',
          now,
        }),
      ).toEqual({
        status: 'up',
        state: 'up',
        dependency: 'database',
        critical: true,
        latencyMs: 4,
        timeoutMs: 3000,
        checkedAt: '2026-11-19T00:00:00.000Z',
        message: 'ok',
        details: {},
      });
    });

    it('maps disabled and degraded to a Terminus "up" status', () => {
      for (const state of ['disabled', 'degraded'] as const) {
        expect(
          buildDependencyDetail({
            dependency: 'redis',
            state,
            timeoutMs: 1000,
            message: state,
          }),
        ).toMatchObject({ status: 'up', state, critical: false, latencyMs: null });
      }
    });

    it('lets a degraded dependency fail readiness explicitly', () => {
      expect(
        buildDependencyDetail({
          dependency: 'queues',
          state: 'degraded',
          timeoutMs: 1000,
          message: 'slow',
          failsReadiness: true,
        }),
      ).toMatchObject({ status: 'down', state: 'degraded' });
    });
  });
});
