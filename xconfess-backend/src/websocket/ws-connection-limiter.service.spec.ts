import { WsConnectionLimiter } from './ws-connection-limiter.service';
import { OperationalMetricsService } from '../observability/operational-metrics.service';

function makeLimiter(
  config: Record<string, unknown>,
  metrics?: OperationalMetricsService,
) {
  return new WsConnectionLimiter(
    { get: jest.fn((key: string) => config[key]) } as any,
    metrics,
  );
}

describe('WsConnectionLimiter (#2392)', () => {
  it('admits up to the per-user limit, then rejects with a safe payload', () => {
    const limiter = makeLimiter({ WS_MAX_CONNECTIONS_PER_USER: 2 });

    expect(limiter.admit('s1', 'u1').admitted).toBe(true);
    expect(limiter.admit('s2', 'u1').admitted).toBe(true);
    const third = limiter.admit('s3', 'u1');

    expect(third.admitted).toBe(false);
    if (!third.admitted) {
      expect(third.payload).toMatchObject({
        code: 'WS_CONNECTION_LIMIT_REACHED',
        scope: 'user',
      });
      expect(third.payload.retryAfterSeconds).toBeGreaterThan(0);
      // Safe: no ids and no configured limit leaked.
      const json = JSON.stringify(third.payload);
      expect(json).not.toContain('u1');
      expect(json).not.toMatch(/\b2\b/);
    }
    // Another user is unaffected.
    expect(limiter.admit('s4', 'u2').admitted).toBe(true);
  });

  it('enforces the global limit across users', () => {
    const limiter = makeLimiter({
      WS_MAX_CONNECTIONS_GLOBAL: 3,
      WS_MAX_CONNECTIONS_PER_USER: 10,
    });
    expect(limiter.admit('a', 'u1').admitted).toBe(true);
    expect(limiter.admit('b', 'u2').admitted).toBe(true);
    expect(limiter.admit('c', 'u3').admitted).toBe(true);

    const rejected = limiter.admit('d', 'u4');
    expect(rejected.admitted).toBe(false);
    if (!rejected.admitted) expect(rejected.payload.scope).toBe('global');
  });

  it('frees capacity on release, and release is idempotent', () => {
    const limiter = makeLimiter({ WS_MAX_CONNECTIONS_PER_USER: 1 });
    limiter.admit('s1', 'u1');
    expect(limiter.admit('s2', 'u1').admitted).toBe(false);

    expect(limiter.release('s1')).toBe(true);
    expect(limiter.release('s1')).toBe(false);
    expect(limiter.admit('s2', 'u1').admitted).toBe(true);
  });

  it('does not let a rejected socket free a slot it never held', () => {
    const limiter = makeLimiter({ WS_MAX_CONNECTIONS_PER_USER: 1 });
    limiter.admit('held', 'u1');
    expect(limiter.admit('rejected', 'u1').admitted).toBe(false);

    expect(limiter.release('rejected')).toBe(false);
    expect(limiter.getStats().active).toBe(1);
    expect(limiter.admit('another', 'u1').admitted).toBe(false);
  });

  it('re-admitting an already admitted socket does not double count', () => {
    const limiter = makeLimiter({ WS_MAX_CONNECTIONS_PER_USER: 1 });
    expect(limiter.admit('s1', 'u1').admitted).toBe(true);
    expect(limiter.admit('s1', 'u1').admitted).toBe(true);
    expect(limiter.getStats()).toMatchObject({ active: 1, accepted: 1 });
  });

  it('falls back to defaults for missing or invalid config', () => {
    const limiter = makeLimiter({
      WS_MAX_CONNECTIONS_GLOBAL: 'abc',
      WS_MAX_CONNECTIONS_PER_USER: -4,
    });
    expect(limiter.maxGlobal).toBe(5000);
    expect(limiter.maxPerUser).toBe(5);
    expect(makeLimiter({ WS_MAX_CONNECTIONS_PER_USER: '7' }).maxPerUser).toBe(
      7,
    );
  });

  it('tracks accepted, rejected and closed in stats and Prometheus metrics', () => {
    const metrics = new OperationalMetricsService();
    const limiter = makeLimiter(
      { WS_MAX_CONNECTIONS_GLOBAL: 2, WS_MAX_CONNECTIONS_PER_USER: 1 },
      metrics,
    );

    limiter.admit('s1', 'u1'); // accepted
    limiter.admit('s2', 'u1'); // rejected_user
    limiter.admit('s3', 'u2'); // accepted
    limiter.admit('s4', 'u3'); // rejected_global
    limiter.release('s1'); // closed

    expect(limiter.getStats()).toEqual({
      active: 1,
      accepted: 2,
      rejectedGlobal: 1,
      rejectedUser: 1,
      closed: 1,
    });

    const text = metrics.renderPrometheus();
    for (const [event, n] of [
      ['accepted', 2],
      ['rejected_user', 1],
      ['rejected_global', 1],
      ['closed', 1],
    ] as const) {
      expect(text).toContain(
        `xconfess_ws_connections_total{namespace="notifications",event="${event}"} ${n}`,
      );
    }
    expect(text).toContain('xconfess_ws_active_connections 1');
    expect(text).not.toMatch(/u1|u2|u3|s1|s2/);
  });

  describe('load', () => {
    it('never exceeds limits under 20,000 connect/disconnect operations', () => {
      const limiter = makeLimiter({
        WS_MAX_CONNECTIONS_GLOBAL: 500,
        WS_MAX_CONNECTIONS_PER_USER: 3,
      });
      const live = new Set<string>();
      let rejected = 0;

      for (let i = 0; i < 20000; i += 1) {
        const id = `sock-${i}`;
        const result = limiter.admit(id, `user-${i % 300}`);
        if (result.admitted) live.add(id);
        else rejected += 1;

        expect(limiter.getStats().active).toBeLessThanOrEqual(500);

        // Close roughly every third live socket to churn capacity.
        if (i % 3 === 0 && live.size > 0) {
          const victim = live.values().next().value as string;
          live.delete(victim);
          limiter.release(victim);
        }
      }

      const stats = limiter.getStats();
      expect(stats.active).toBe(live.size);
      expect(stats.accepted).toBe(stats.closed + stats.active);
      expect(stats.accepted + stats.rejectedGlobal + stats.rejectedUser).toBe(
        20000,
      );
      expect(rejected).toBeGreaterThan(0);
    });
  });
});
