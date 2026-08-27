import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueHealthIndicator } from './queue.health';

const QUEUE_NAMES = [
  'notifications',
  'notifications-dlq',
  'export-queue',
  'confession-draft-publisher',
] as const;

type QueueName = (typeof QUEUE_NAMES)[number];

function makeMockQueue(
  workers = 1,
  counts = { active: 0, waiting: 0, failed: 0, delayed: 0 },
  pingMock = jest.fn().mockResolvedValue('PONG'),
) {
  return {
    getWorkers: jest
      .fn()
      .mockResolvedValue(new Array(workers).fill({ id: 'w1' })),
    getJobCounts: jest.fn().mockResolvedValue(counts),
    client: Promise.resolve({
      ping: pingMock,
    }),
  };
}

type MockQueue = ReturnType<typeof makeMockQueue>;

function buildModule(
  queueOverrides: Partial<Record<QueueName, MockQueue>>,
  backgroundJobsValue?: string,
  latencyThresholdValue?: number,
) {
  const queues = Object.fromEntries(
    QUEUE_NAMES.map((name) => [name, queueOverrides[name] ?? makeMockQueue()]),
  );

  return Test.createTestingModule({
    providers: [
      QueueHealthIndicator,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => {
            if (key === 'ENABLE_BACKGROUND_JOBS') {
              return backgroundJobsValue;
            }
            if (key === 'REDIS_QUEUE_LATENCY_THRESHOLD_MS') {
              return latencyThresholdValue;
            }
            return undefined;
          }),
        },
      },
      ...QUEUE_NAMES.map((name) => ({
        provide: getQueueToken(name),
        useValue: queues[name],
      })),
    ],
  }).compile();
}

describe('QueueHealthIndicator', () => {
  let indicator: QueueHealthIndicator;

  describe('when background jobs are disabled', () => {
    describe('with ENABLE_BACKGROUND_JOBS set to "false"', () => {
      beforeEach(async () => {
        const module: TestingModule = await buildModule({}, 'false');
        indicator = module.get(QueueHealthIndicator);
      });

      it('returns up with mode=disabled and intentional disable reason', async () => {
        const result = await indicator.isHealthy('queues');
        expect(result.queues.status).toBe('up');
        expect(result.queues).toMatchObject({
          mode: 'disabled',
          severity: 'info',
        });
        expect(result.queues.reason).toContain('"false"');
        expect(result.queues.reason).toContain('intentionally disabled');
      });
    });

    describe('with ENABLE_BACKGROUND_JOBS not set (undefined)', () => {
      beforeEach(async () => {
        const module: TestingModule = await buildModule({}, undefined);
        indicator = module.get(QueueHealthIndicator);
      });

      it('returns up with mode=disabled and unset reason', async () => {
        const result = await indicator.isHealthy('queues');
        expect(result.queues.status).toBe('up');
        expect(result.queues).toMatchObject({
          mode: 'disabled',
          severity: 'info',
        });
        expect(result.queues.reason).toContain('not set');
        expect(result.queues.reason).toContain('defaults to disabled');
      });
    });

    describe('with ENABLE_BACKGROUND_JOBS set to unexpected value', () => {
      beforeEach(async () => {
        const module: TestingModule = await buildModule({}, 'yes');
        indicator = module.get(QueueHealthIndicator);
      });

      it('returns up with mode=disabled and misconfiguration reason', async () => {
        const result = await indicator.isHealthy('queues');
        expect(result.queues.status).toBe('up');
        expect(result.queues).toMatchObject({
          mode: 'disabled',
          severity: 'info',
        });
        expect(result.queues.reason).toContain('"yes"');
        expect(result.queues.reason).toContain('expected "true"');
      });
    });

    it('skips queue checks entirely when disabled', async () => {
      const module: TestingModule = await buildModule({}, 'false');
      indicator = module.get(QueueHealthIndicator);

      const result = await indicator.isHealthy('queues');
      // Per-queue details must not be present when disabled
      expect(result.queues['notifications']).toBeUndefined();
      expect(result.queues['notifications-dlq']).toBeUndefined();
      expect(result.queues['export-queue']).toBeUndefined();
      expect(result.queues['confession-draft-publisher']).toBeUndefined();
    });
  });

  describe('when background jobs are enabled', () => {
    describe('and all queues have workers', () => {
      beforeEach(async () => {
        const module: TestingModule = await buildModule({}, 'true');
        indicator = module.get(QueueHealthIndicator);
      });

      it('returns up with per-queue worker and count details', async () => {
        const result = await indicator.isHealthy('queues');
        expect(result.queues.status).toBe('up');
        expect(result.queues['notifications']).toMatchObject({
          status: 'up',
          workers: 1,
        });
      });

      it('does not include disabled mode fields when enabled', async () => {
        const result = await indicator.isHealthy('queues');
        expect(result.queues.mode).toBeUndefined();
        expect(result.queues.reason).toBeUndefined();
        expect(result.queues.severity).toBeUndefined();
      });
    });

    describe('and a worker-required queue has no workers', () => {
      beforeEach(async () => {
        const module: TestingModule = await buildModule(
          {
            notifications: makeMockQueue(0),
          },
          'true',
        );
        indicator = module.get(QueueHealthIndicator);
      });

      it('throws HealthCheckError', async () => {
        await expect(indicator.isHealthy('queues')).rejects.toThrow(
          HealthCheckError,
        );
      });

      it('marks the affected queue as down in the error detail', async () => {
        expect.assertions(2);
        try {
          await indicator.isHealthy('queues');
        } catch (err) {
          expect(err).toBeInstanceOf(HealthCheckError);
          const causes = (err as HealthCheckError).causes as Record<
            string,
            Record<string, unknown>
          >;
          expect(causes['queues']['notifications']).toMatchObject({
            status: 'down',
            workers: 0,
          });
        }
      });
    });

    describe('and the DLQ has no workers', () => {
      beforeEach(async () => {
        const module: TestingModule = await buildModule(
          {
            'notifications-dlq': makeMockQueue(0),
          },
          'true',
        );
        indicator = module.get(QueueHealthIndicator);
      });

      it('remains healthy — DLQ does not require workers', async () => {
        const result = await indicator.isHealthy('queues');
        expect(result.queues.status).toBe('up');
        expect(result.queues['notifications-dlq']).toMatchObject({
          status: 'up',
          workers: 0,
        });
      });
    });

    describe('and a queue throws during the check', () => {
      beforeEach(async () => {
        const broken: MockQueue = {
          getWorkers: jest
            .fn()
            .mockRejectedValue(new Error('ECONNREFUSED')),
          getJobCounts: jest.fn().mockResolvedValue({}),
        };
        const module: TestingModule = await buildModule(
          {
            'export-queue': broken,
          },
          'true',
        );
        indicator = module.get(QueueHealthIndicator);
      });

      it('throws HealthCheckError with error detail for the failing queue', async () => {
        await expect(indicator.isHealthy('queues')).rejects.toThrow(
          HealthCheckError,
        );
      });
    });

    describe('job counts are forwarded in the result', () => {
      beforeEach(async () => {
        const queueWithJobs = makeMockQueue(2, {
          active: 3,
          waiting: 10,
          failed: 1,
          delayed: 0,
        });
        const module: TestingModule = await buildModule(
          {
            notifications: queueWithJobs,
          },
          'true',
        );
        indicator = module.get(QueueHealthIndicator);
      });

      it('includes counts in the healthy result', async () => {
        const result = await indicator.isHealthy('queues');
        expect(result.queues['notifications']).toMatchObject({
          counts: { active: 3, waiting: 10, failed: 1, delayed: 0 },
        });
      });
    });

    describe('Redis queue latency and availability checks', () => {
      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('includes latencyMs in healthy results', async () => {
        let currentTime = 1000;
        jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

        const pingMock = jest.fn().mockImplementation(async () => {
          currentTime += 10; // 10ms latency
        });
        const queues = Object.fromEntries(
          QUEUE_NAMES.map((name) => [name, makeMockQueue(1, undefined, pingMock)]),
        );

        const module: TestingModule = await buildModule(queues, 'true', 250);
        indicator = module.get(QueueHealthIndicator);

        const result = await indicator.isHealthy('queues');
        expect(result.queues.status).toBe('up');
        expect(result.queues['notifications']).toMatchObject({
          status: 'up',
          latencyMs: 10,
        });
      });

      it('marks queue degraded and throws HealthCheckError when latency exceeds threshold', async () => {
        let currentTime = 1000;
        jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

        const slowPing = jest.fn().mockImplementation(async () => {
          currentTime += 300; // 300ms latency (threshold is 250)
        });
        const fastPing = jest.fn().mockImplementation(async () => {
          currentTime += 10; // 10ms latency
        });

        const queues = Object.fromEntries(
          QUEUE_NAMES.map((name) => [
            name,
            makeMockQueue(
              1,
              undefined,
              name === 'notifications' ? slowPing : fastPing,
            ),
          ]),
        );

        const module: TestingModule = await buildModule(queues, 'true', 250);
        indicator = module.get(QueueHealthIndicator);

        expect.assertions(3);
        try {
          await indicator.isHealthy('queues');
        } catch (err) {
          expect(err).toBeInstanceOf(HealthCheckError);
          const causes = (err as HealthCheckError).causes as Record<
            string,
            Record<string, any>
          >;
          expect(causes['queues']['notifications']).toMatchObject({
            status: 'degraded',
            latencyMs: 300,
          });
          expect(causes['queues']['notifications-dlq']).toMatchObject({
            status: 'up',
            latencyMs: 10,
          });
        }
      });

      it('marks queue down and throws HealthCheckError when Redis ping fails', async () => {
        const pingMock = jest.fn().mockRejectedValue(new Error('Connection timeout'));
        const brokenQueue = makeMockQueue(1, undefined, pingMock);

        const module: TestingModule = await buildModule(
          {
            notifications: brokenQueue,
          },
          'true',
          250,
        );
        indicator = module.get(QueueHealthIndicator);

        expect.assertions(2);
        try {
          await indicator.isHealthy('queues');
        } catch (err) {
          expect(err).toBeInstanceOf(HealthCheckError);
          const causes = (err as HealthCheckError).causes as Record<
            string,
            Record<string, any>
          >;
          expect(causes['queues']['notifications']).toMatchObject({
            status: 'down',
            error: 'Connection timeout',
          });
        }
      });
    });
  });
});
