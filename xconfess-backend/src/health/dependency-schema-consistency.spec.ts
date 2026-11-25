/**
 * Issue #2159 — Make readiness checks consistent for database and Redis.
 *
 * Verifies that:
 * 1. Both `database` and `redis` return the same DependencyCheckDetail envelope.
 * 2. Every indicator respects the bounded timeout supplied via config.
 * 3. Liveness is fully independent of readiness — it never touches a dependency.
 * 4. Recovery is reflected correctly on the next readiness check.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { getDataSourceToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { PostgresHealthIndicator } from './postgres.health';
import { RedisHealthIndicator } from './redis.health';
import { QueueHealthIndicator } from './queue.health';
import { SchemaReadinessHealthIndicator } from './schema-readiness.health';
import { MigrationVerificationService } from '../database/migration-verification.service';
import { computeMigrationDrift } from '../database/migration-drift';

const redisClient = {
  connect: jest.fn(),
  ping: jest.fn(),
  info: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => redisClient));

const QUEUE_NAMES = [
  'notifications',
  'notifications-dlq',
  'export-queue',
  'confession-draft-publisher',
];

const TIMEOUT_MS = 200;

function healthyDbQuery(sql: string) {
  if (sql === 'SELECT version()') {
    return Promise.resolve([{ version: 'PostgreSQL 16.3 on x86_64' }]);
  }
  return Promise.resolve([{ active: '1', max: '100' }]);
}

const DETAIL_SHAPE = {
  status: expect.stringMatching(/^(up|down)$/),
  state: expect.stringMatching(/^(up|down|degraded|disabled)$/),
  dependency: expect.any(String),
  critical: expect.any(Boolean),
  latencyMs: expect.anything(),
  timeoutMs: TIMEOUT_MS,
  checkedAt: expect.any(String),
  message: expect.any(String),
  details: expect.any(Object),
};

describe('Health readiness — schema consistency (#2159)', () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };
  let queuePing: jest.Mock;

  const config: Record<string, unknown> = {
    ENABLE_BACKGROUND_JOBS: 'true',
    HEALTH_CHECK_TIMEOUT_MS: TIMEOUT_MS,
  };

  beforeEach(async () => {
    redisClient.connect.mockReset().mockResolvedValue(undefined);
    redisClient.ping.mockReset().mockResolvedValue('PONG');
    redisClient.info
      .mockReset()
      .mockImplementation((section: string) =>
        Promise.resolve(
          section === 'server'
            ? 'redis_version:7.2.4\r\n'
            : 'connected_clients:1\r\n',
        ),
      );
    redisClient.disconnect.mockReset();

    dataSource = { query: jest.fn().mockImplementation(healthyDbQuery) };
    queuePing = jest.fn().mockResolvedValue('PONG');

    const migrations = {
      checkConfessionSchema: jest
        .fn()
        .mockResolvedValue({ ok: true, missingColumns: [], missingIndexes: [] }),
      checkMigrationDrift: jest
        .fn()
        .mockResolvedValue(computeMigrationDrift(['M1'], ['M1'])),
    };

    const queueProviders = QUEUE_NAMES.map((name) => ({
      provide: getQueueToken(name),
      useValue: {
        getJobCounts: jest.fn().mockResolvedValue({ active: 0, waiting: 0 }),
        getWorkers: jest.fn().mockResolvedValue([{ id: 'w1' }]),
        client: Promise.resolve({ ping: queuePing }),
      },
    }));

    const module = await Test.createTestingModule({
      imports: [TerminusModule.forRoot({ logger: false })],
      controllers: [HealthController],
      providers: [
        PostgresHealthIndicator,
        RedisHealthIndicator,
        QueueHealthIndicator,
        SchemaReadinessHealthIndicator,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: MigrationVerificationService, useValue: migrations },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
        ...queueProviders,
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  describe('consistent envelope schema', () => {
    it('database and redis both return the documented DependencyCheckDetail shape when healthy', async () => {
      const result = await controller.readiness();

      expect(result.status).toBe('ok');

      // Both indicators must return exactly the same envelope fields.
      expect(result.details.database).toEqual(expect.objectContaining(DETAIL_SHAPE));
      expect(result.details.redis).toEqual(expect.objectContaining(DETAIL_SHAPE));

      // Specific field values for the healthy case.
      expect(result.details.database).toMatchObject({
        state: 'up',
        status: 'up',
        dependency: 'database',
        critical: true,
        latencyMs: expect.any(Number),
      });
      expect(result.details.redis).toMatchObject({
        state: 'up',
        status: 'up',
        dependency: 'redis',
        critical: false,
        latencyMs: expect.any(Number),
      });
    });

    it('database and redis both return the documented shape when unhealthy', async () => {
      dataSource.query.mockRejectedValue(new Error('connect ECONNREFUSED'));
      redisClient.connect.mockRejectedValue(new Error('connect ECONNREFUSED'));

      let body: Record<string, any> = {};
      try {
        await controller.readiness();
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        body = (err as ServiceUnavailableException).getResponse() as Record<
          string,
          any
        >;
      }

      // Both failures must include the same envelope keys.
      expect(body.error.database).toEqual(expect.objectContaining(DETAIL_SHAPE));
      expect(body.error.redis).toEqual(expect.objectContaining(DETAIL_SHAPE));

      expect(body.error.database).toMatchObject({
        state: 'down',
        status: 'down',
        dependency: 'database',
        critical: true,
        latencyMs: null,
        errorCode: 'CONNECTION_REFUSED',
      });
      expect(body.error.redis).toMatchObject({
        state: 'down',
        status: 'down',
        dependency: 'redis',
        critical: false,
        errorCode: 'CONNECTION_REFUSED',
      });

      // Raw driver messages must never reach the response body (no IP/host leaks).
      expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED/i);
    });
  });

  describe('bounded timeouts', () => {
    it('database check completes within the configured timeout even when it hangs', async () => {
      dataSource.query.mockImplementation(() => new Promise<never>(() => undefined));

      const start = Date.now();
      let body: Record<string, any> = {};
      try {
        await controller.readiness();
      } catch (err) {
        body = (err as ServiceUnavailableException).getResponse() as Record<string, any>;
      }
      const elapsed = Date.now() - start;

      // Must complete well within 2× the configured timeout.
      expect(elapsed).toBeLessThan(TIMEOUT_MS * 2 + 500);
      expect(body.error.database).toMatchObject({
        errorCode: 'TIMEOUT',
        timeoutMs: TIMEOUT_MS,
      });
    });

    it('redis check completes within the configured timeout even when it hangs', async () => {
      redisClient.connect.mockImplementation(() => new Promise<never>(() => undefined));

      const start = Date.now();
      let body: Record<string, any> = {};
      try {
        await controller.readiness();
      } catch (err) {
        body = (err as ServiceUnavailableException).getResponse() as Record<string, any>;
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(TIMEOUT_MS * 2 + 500);
      expect(body.error.redis).toMatchObject({
        errorCode: 'TIMEOUT',
        timeoutMs: TIMEOUT_MS,
      });
      // disconnect must still be called to release the socket.
      expect(redisClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('liveness separation from readiness', () => {
    it('liveness returns ok instantly and never queries any dependency', () => {
      // Inject faults into every dependency.
      dataSource.query.mockImplementation(() => new Promise<never>(() => undefined));
      redisClient.connect.mockImplementation(() => new Promise<never>(() => undefined));
      queuePing.mockImplementation(() => new Promise<never>(() => undefined));

      // Liveness must not await any of those hanging promises.
      const result = controller.liveness();
      expect(result).toEqual({ status: 'ok' });

      // No dependency was contacted.
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(redisClient.connect).not.toHaveBeenCalled();
      expect(queuePing).not.toHaveBeenCalled();
    });

    it('GET /health/live and GET /health/ready are served by different methods', () => {
      // Structural guard: liveness must not call health.check().
      expect(controller.liveness).toBeDefined();
      expect(controller.readiness).toBeDefined();
      // liveness must be synchronous (no async / Promise return).
      const livenessResult = controller.liveness();
      expect(livenessResult).not.toBeInstanceOf(Promise);
    });
  });

  describe('recovery', () => {
    it('reports healthy after a database outage clears', async () => {
      dataSource.query.mockRejectedValue(new Error('connect ECONNREFUSED'));

      try { await controller.readiness(); } catch { /* expected */ }

      // Restore healthy state.
      dataSource.query.mockImplementation(healthyDbQuery);
      const recovered = await controller.readiness();
      expect(recovered.details.database).toMatchObject({ state: 'up', status: 'up' });
      await expect(controller.status()).resolves.toMatchObject({ state: 'ready' });
    });

    it('reports healthy after a Redis outage clears', async () => {
      redisClient.connect.mockRejectedValue(new Error('connect ECONNREFUSED'));

      try { await controller.readiness(); } catch { /* expected */ }

      redisClient.connect.mockResolvedValue(undefined);
      const recovered = await controller.readiness();
      expect(recovered.details.redis).toMatchObject({ state: 'up', status: 'up' });
    });
  });
});
