/**
 * Outage and recovery behaviour of the readiness endpoints, exercised through
 * the real Terminus HealthCheckService and the real dependency indicators.
 * Only the drivers (TypeORM DataSource, ioredis, BullMQ queues) are faked.
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

const TIMEOUT_MS = 150;
const hang = () => new Promise<never>(() => undefined);

function healthyDatabaseQuery(sql: string) {
  if (sql === 'SELECT version()') {
    return Promise.resolve([{ version: 'PostgreSQL 16.3 on x86_64' }]);
  }
  return Promise.resolve([{ active: '2', max: '100' }]);
}

describe('Health readiness — outage and recovery', () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };
  let queuePing: jest.Mock;
  let migrations: {
    checkConfessionSchema: jest.Mock;
    checkMigrationDrift: jest.Mock;
  };

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
          section === 'server' ? 'redis_version:7.2.4\r\n' : 'connected_clients:3\r\n',
        ),
      );
    redisClient.disconnect.mockReset();

    dataSource = { query: jest.fn().mockImplementation(healthyDatabaseQuery) };
    queuePing = jest.fn().mockResolvedValue('PONG');
    migrations = {
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
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
        ...queueProviders,
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  async function readinessFailure(): Promise<Record<string, any>> {
    try {
      await controller.readiness();
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      return (error as ServiceUnavailableException).getResponse() as Record<
        string,
        any
      >;
    }
    throw new Error('expected readiness to fail');
  }

  it('uses one documented shape for every dependency', async () => {
    const result = await controller.readiness();

    expect(result.status).toBe('ok');
    for (const name of ['database', 'redis', 'queues', 'schema']) {
      expect(result.details[name]).toEqual(
        expect.objectContaining({
          status: 'up',
          state: 'up',
          dependency: name,
          critical: name === 'database' || name === 'schema',
          latencyMs: expect.any(Number),
          timeoutMs: TIMEOUT_MS,
          checkedAt: expect.any(String),
          message: expect.any(String),
          details: expect.any(Object),
        }),
      );
    }
    expect(result.subsystems).toEqual([
      { name: 'database', status: 'up' },
      { name: 'redis', status: 'up' },
      { name: 'queues', status: 'up' },
      { name: 'schema', status: 'up' },
    ]);
  });

  describe('database outage', () => {
    it('fails readiness, keeps liveness up, and recovers', async () => {
      dataSource.query.mockRejectedValue(
        new Error('connect ECONNREFUSED 10.20.30.40:5432'),
      );

      const body = await readinessFailure();
      expect(body.error.database).toMatchObject({
        status: 'down',
        state: 'down',
        errorCode: 'CONNECTION_REFUSED',
        latencyMs: null,
      });
      expect(JSON.stringify(body)).not.toContain('10.20.30.40');
      expect(controller.liveness()).toEqual({ status: 'ok' });
      await expect(controller.status()).resolves.toMatchObject({
        state: 'down',
        checks: { database: { status: 'down', errorCode: 'CONNECTION_REFUSED' } },
      });

      dataSource.query.mockImplementation(healthyDatabaseQuery);
      const recovered = await controller.readiness();
      expect(recovered.details.database.state).toBe('up');
      await expect(controller.status()).resolves.toMatchObject({ state: 'ready' });
    });

    it('bounds a hanging database to its timeout', async () => {
      dataSource.query.mockImplementation(hang);

      const startedAt = Date.now();
      const body = await readinessFailure();
      expect(Date.now() - startedAt).toBeLessThan(2000);
      expect(body.error.database).toMatchObject({
        errorCode: 'TIMEOUT',
        timeoutMs: TIMEOUT_MS,
      });
      expect(controller.liveness()).toEqual({ status: 'ok' });
    });
  });

  describe('Redis outage', () => {
    it('degrades status, fails readiness, and recovers', async () => {
      redisClient.connect.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const body = await readinessFailure();
      expect(body.error.redis).toMatchObject({
        state: 'down',
        critical: false,
        errorCode: 'CONNECTION_REFUSED',
      });
      expect(redisClient.disconnect).toHaveBeenCalled();
      await expect(controller.status()).resolves.toMatchObject({
        state: 'degraded',
      });

      redisClient.connect.mockResolvedValue(undefined);
      const recovered = await controller.readiness();
      expect(recovered.details.redis.state).toBe('up');
    });

    it('bounds a hanging Redis connection to its timeout', async () => {
      redisClient.connect.mockImplementation(hang);

      const body = await readinessFailure();
      expect(body.error.redis).toMatchObject({ errorCode: 'TIMEOUT' });
      expect(redisClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('queue outage', () => {
    it('reports every unanswered queue on timeout and recovers', async () => {
      queuePing.mockImplementation(hang);

      const body = await readinessFailure();
      expect(body.error.queues).toMatchObject({
        status: 'down',
        state: 'down',
        errorCode: 'TIMEOUT',
      });
      for (const name of QUEUE_NAMES) {
        expect(body.error.queues.details.queues[name]).toMatchObject({
          status: 'down',
          errorCode: 'TIMEOUT',
        });
      }

      queuePing.mockResolvedValue('PONG');
      const recovered = await controller.readiness();
      expect(recovered.details.queues.state).toBe('up');
    });
  });

  describe('schema drift', () => {
    it('fails readiness while migrations are pending and recovers once applied', async () => {
      migrations.checkMigrationDrift.mockResolvedValue(
        computeMigrationDrift(['M1', 'M2'], ['M1']),
      );

      const body = await readinessFailure();
      expect(body.error.schema).toMatchObject({
        errorCode: 'PENDING_MIGRATIONS',
        details: { migrations: { pending: ['M2'] } },
      });

      migrations.checkMigrationDrift.mockResolvedValue(
        computeMigrationDrift(['M1', 'M2'], ['M1', 'M2']),
      );
      const recovered = await controller.readiness();
      expect(recovered.details.schema.state).toBe('up');
    });
  });

  describe('liveness independence', () => {
    it('never calls a dependency, even when all of them are down', () => {
      dataSource.query.mockImplementation(hang);
      redisClient.connect.mockImplementation(hang);
      queuePing.mockImplementation(hang);

      expect(controller.liveness()).toEqual({ status: 'ok' });
      expect(dataSource.query).not.toHaveBeenCalled();
      expect(redisClient.connect).not.toHaveBeenCalled();
      expect(queuePing).not.toHaveBeenCalled();
      expect(migrations.checkConfessionSchema).not.toHaveBeenCalled();
    });
  });

  describe('background jobs disabled', () => {
    beforeEach(() => {
      config.ENABLE_BACKGROUND_JOBS = 'false';
    });
    afterEach(() => {
      config.ENABLE_BACKGROUND_JOBS = 'true';
    });

    it('reports Redis and queues as disabled without probing them', async () => {
      const result = await controller.readiness();
      expect(result.details.redis).toMatchObject({ status: 'up', state: 'disabled' });
      expect(result.details.queues).toMatchObject({ status: 'up', state: 'disabled' });
      expect(redisClient.connect).not.toHaveBeenCalled();
      await expect(controller.status()).resolves.toMatchObject({ state: 'disabled' });
    });
  });
});
