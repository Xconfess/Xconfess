import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { SchemaReadinessHealthIndicator } from './schema-readiness.health';
import { QueueHealthIndicator } from './queue.health';
import { PostgresHealthIndicator } from './postgres.health';

const UP = (key: string, extra?: Record<string, unknown>) => ({
  [key]: { status: 'up', ...extra },
});

describe('HealthController', () => {
  let controller: HealthController;
  let configService: { get: jest.Mock };

  const healthService = {
    check: jest
      .fn()
      .mockImplementation((checks: Array<() => Promise<unknown>>) =>
        Promise.all(checks.map((fn) => fn())).then((results) => ({
          status: 'ok',
          info: Object.assign({}, ...results),
          error: {},
          details: Object.assign({}, ...results),
        })),
      ),
  };
  const dbIndicator = {
    isHealthy: jest.fn().mockResolvedValue(
      UP('database', { latencyMs: 2, version: 'PostgreSQL 16.3', activeConnections: 5, maxConnections: 100 }),
    ),
  };
  const redisIndicator = {
    isHealthy: jest.fn().mockResolvedValue(
      UP('redis', { host: 'localhost', port: 6379, latencyMs: 1, version: '7.2.0', connectedClients: 3 }),
    ),
  };
  const schemaIndicator = {
    isHealthy: jest.fn().mockResolvedValue(UP('schema')),
  };
  const queueIndicator = {
    isHealthy: jest.fn().mockResolvedValue(UP('queues')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = { get: jest.fn().mockReturnValue('false') };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthService },
        { provide: PostgresHealthIndicator, useValue: dbIndicator },
        { provide: RedisHealthIndicator, useValue: redisIndicator },
        { provide: SchemaReadinessHealthIndicator, useValue: schemaIndicator },
        { provide: QueueHealthIndicator, useValue: queueIndicator },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  describe('GET /health/live', () => {
    it('returns {status: ok} without calling any indicator', () => {
      const result = controller.liveness();
      expect(result).toEqual({ status: 'ok' });
      expect(healthService.check).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    it('delegates to HealthCheckService', async () => {
      await controller.readiness();
      expect(healthService.check).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.any(Function),
          expect.any(Function),
          expect.any(Function),
          expect.any(Function),
        ]),
      );
    });

    it('calls all four indicators', async () => {
      await controller.readiness();
      expect(dbIndicator.isHealthy).toHaveBeenCalledWith('database');
      expect(redisIndicator.isHealthy).toHaveBeenCalledWith('redis');
      expect(queueIndicator.isHealthy).toHaveBeenCalledWith('queues');
      expect(schemaIndicator.isHealthy).toHaveBeenCalledWith('schema');
    });

    it('includes backgroundJobMode in readiness response', async () => {
      configService.get.mockReturnValue('false');
      const result = await controller.readiness();
      expect(result).toHaveProperty('backgroundJobMode', 'disabled');
    });

    it('reports backgroundJobMode as enabled when ENABLE_BACKGROUND_JOBS=true', async () => {
      configService.get.mockReturnValue('true');
      const result = await controller.readiness();
      expect(result).toHaveProperty('backgroundJobMode', 'enabled');
    });

    it('includes subsystems summary array', async () => {
      const result = await controller.readiness();
      expect(result.subsystems).toEqual(
        expect.arrayContaining([
          { name: 'database', status: 'up' },
          { name: 'redis', status: 'up' },
          { name: 'queues', status: 'up' },
          { name: 'schema', status: 'up' },
        ]),
      );
    });

    it('marks disabled subsystems in the summary', async () => {
      redisIndicator.isHealthy.mockResolvedValue({
        redis: { status: 'up', mode: 'disabled', reason: 'test', severity: 'info' },
      });

      const result = await controller.readiness();
      const redisSub = result.subsystems.find(
        (s: { name: string }) => s.name === 'redis',
      );
      expect(redisSub).toEqual({ name: 'redis', status: 'disabled' });
    });

    it('marks queue subsystem degraded when nested queue details are degraded', async () => {
      queueIndicator.isHealthy.mockResolvedValue({
        queues: {
          status: 'down',
          notifications: { status: 'degraded', latencyMs: 300 },
          'notifications-dlq': { status: 'up', latencyMs: 10 },
        },
      });

      const result = await controller.readiness();
      const queueSub = result.subsystems.find(
        (s: { name: string }) => s.name === 'queues',
      );
      expect(queueSub).toEqual({ name: 'queues', status: 'degraded' });
    });
  });

  describe('GET /health (backward-compat alias)', () => {
    it('calls the same four indicators as /health/ready', async () => {
      await controller.check();
      expect(dbIndicator.isHealthy).toHaveBeenCalledWith('database');
      expect(redisIndicator.isHealthy).toHaveBeenCalledWith('redis');
      expect(queueIndicator.isHealthy).toHaveBeenCalledWith('queues');
      expect(schemaIndicator.isHealthy).toHaveBeenCalledWith('schema');
    });

    it('includes backgroundJobMode in check response', async () => {
      configService.get.mockReturnValue('false');
      const result = await controller.check();
      expect(result).toHaveProperty('backgroundJobMode', 'disabled');
    });

    it('includes subsystems summary in check response', async () => {
      const result = await controller.check();
      expect(result.subsystems).toHaveLength(4);
    });
  });
});
