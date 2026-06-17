import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { SchemaReadinessHealthIndicator } from './schema-readiness.health';
import { QueueHealthIndicator } from './queue.health';

const UP = (key: string) => ({ [key]: { status: 'up' } });

describe('HealthController', () => {
  let controller: HealthController;

  const healthService = {
    check: jest
      .fn()
      .mockImplementation((checks: Array<() => Promise<unknown>>) =>
        Promise.all(checks.map((fn) => fn())).then((results) => ({
          status: 'ok',
          details: Object.assign({}, ...results),
        })),
      ),
  };
  const dbIndicator = {
    pingCheck: jest.fn().mockResolvedValue(UP('database')),
  };
  const redisIndicator = {
    isHealthy: jest.fn().mockResolvedValue(UP('redis')),
  };
  const schemaIndicator = {
    isHealthy: jest.fn().mockResolvedValue(UP('schema')),
  };
  const queueIndicator = {
    isHealthy: jest.fn().mockResolvedValue(UP('queues')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthService },
        { provide: TypeOrmHealthIndicator, useValue: dbIndicator },
        { provide: RedisHealthIndicator, useValue: redisIndicator },
        { provide: SchemaReadinessHealthIndicator, useValue: schemaIndicator },
        { provide: QueueHealthIndicator, useValue: queueIndicator },
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
      expect(dbIndicator.pingCheck).toHaveBeenCalledWith('database');
      expect(redisIndicator.isHealthy).toHaveBeenCalledWith('redis');
      expect(queueIndicator.isHealthy).toHaveBeenCalledWith('queues');
      expect(schemaIndicator.isHealthy).toHaveBeenCalledWith('schema');
    });
  });

  describe('GET /health (backward-compat alias)', () => {
    it('calls the same four indicators as /health/ready', async () => {
      await controller.check();
      expect(dbIndicator.pingCheck).toHaveBeenCalledWith('database');
      expect(redisIndicator.isHealthy).toHaveBeenCalledWith('redis');
      expect(queueIndicator.isHealthy).toHaveBeenCalledWith('queues');
      expect(schemaIndicator.isHealthy).toHaveBeenCalledWith('schema');
    });
  });
});
