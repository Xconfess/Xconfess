import { NotificationProcessor, NOTIFICATION_DLQ, NOTIFICATION_QUEUE, NotificationJobData } from './notification.processor';
import { EmailNotificationService } from '../services/email-notification.service';
import { AppLogger } from '../../logger/logger.service';
import { Queue, Job } from 'bullmq';
import { createHash } from 'node:crypto';

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let emailNotificationService: { sendEmail: jest.Mock };
  let dlqQueue: { add: jest.Mock };
  let notificationQueue: { client: Promise<any> };
  let redisValues: Map<string, string>;
  let appLogger: { incrementCounter: jest.Mock; observeTimer: jest.Mock };

  beforeEach(() => {
    emailNotificationService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };

    dlqQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    redisValues = new Map();
    const redis = {
      get: jest.fn(async (key: string) => redisValues.get(key) ?? null),
      set: jest.fn(async (key: string, value: string, ...options: unknown[]) => {
        if (options.includes('NX') && redisValues.has(key)) return null;
        redisValues.set(key, value);
        return 'OK';
      }),
      eval: jest.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
        if (redisValues.get(key) === token) redisValues.delete(key);
        return 1;
      }),
    };
    notificationQueue = { client: Promise.resolve(redis) };

    appLogger = {
      incrementCounter: jest.fn(),
      observeTimer: jest.fn(),
    };

    processor = new NotificationProcessor(
      emailNotificationService as unknown as EmailNotificationService,
      dlqQueue as unknown as Queue<NotificationJobData>,
      notificationQueue as unknown as Queue<NotificationJobData>,
      appLogger as unknown as AppLogger,
    );
  });

  it('processes jobs without HTTP request context (no req, no middleware)', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-nohttp',
      attemptsMade: 0,
      data: { userId: 'user-1', type: 'test', title: 'Title', message: 'Message' },
      opts: {},
    } as unknown as Job<NotificationJobData>;

    await expect(processor.process(job)).resolves.not.toThrow();
    expect(emailNotificationService.sendEmail).toHaveBeenCalledWith(job.data);
  });

  it('should process notification jobs and emit processing metrics', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-123',
      attemptsMade: 0,
      data: { userId: 'user-1', type: 'test', title: 'Title', message: 'Message' },
      opts: {},
    } as unknown as Job<NotificationJobData>;

    await processor.process(job);

    expect(emailNotificationService.sendEmail).toHaveBeenCalledWith(job.data);
    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_processing_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name }),
    );
    expect(appLogger.observeTimer).toHaveBeenCalledWith(
      'notification_queue_processing_duration_ms',
      expect.any(Number),
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name }),
    );
  });

  it('should count retries for non-exhausted failed jobs', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-456',
      attemptsMade: 1,
      data: { userId: 'user-2', type: 'test', title: 'Title', message: 'Message' },
      opts: { attempts: 3 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job, new Error('transient failure'));

    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_retry_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name, attempt: job.attemptsMade }),
    );
    expect(dlqQueue.add).not.toHaveBeenCalled();
  });

  it('should move exhausted failed jobs to the dead-letter queue and count failures', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-789',
      attemptsMade: 3,
      data: { userId: 'user-3', type: 'test', title: 'Title', message: 'Message' },
      opts: { attempts: 3 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job, new Error('terminal failure'));

    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_failure_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name }),
    );
    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_dlq_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE, jobName: job.name }),
    );
    expect(dlqQueue.add).toHaveBeenCalledWith(
      'dead-letter',
      expect.objectContaining({
        ...job.data,
        _meta: expect.objectContaining({ originalJobId: String(job.id), attemptsMade: job.attemptsMade, lastError: 'terminal failure' }),
      }),
      expect.objectContaining({ removeOnComplete: false, removeOnFail: false }),
    );
    expect(dlqQueue.add.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        jobId: `notification-${createHash('sha256').update('job-789').digest('hex')}`,
      }),
    );
  });

  // ── Backpressure / retry behavior (issue #1815) ─────────────────────────

  it('should not move to DLQ on first failure (attempt 1 of 5)', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-retry-1',
      attemptsMade: 1,
      data: { userId: 'user-r1', type: 'test', title: 'T', message: 'M' },
      opts: { attempts: 5 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job, new Error('transient'));

    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_retry_total',
      1,
      expect.objectContaining({ attempt: 1 }),
    );
    expect(dlqQueue.add).not.toHaveBeenCalled();
    expect(appLogger.incrementCounter).not.toHaveBeenCalledWith(
      'notification_queue_failure_total',
      expect.anything(),
      expect.anything(),
    );
  });

  it('should not move to DLQ when attemptsMade < maxAttempts', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-retry-4',
      attemptsMade: 4,
      data: { userId: 'user-r4', type: 'test', title: 'T', message: 'M' },
      opts: { attempts: 5 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job, new Error('still retrying'));

    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_retry_total',
      1,
      expect.objectContaining({ attempt: 4 }),
    );
    expect(dlqQueue.add).not.toHaveBeenCalled();
  });

  it('should move to DLQ exactly when attemptsMade >= maxAttempts', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-exhausted',
      attemptsMade: 5,
      data: { userId: 'user-ex', type: 'test', title: 'T', message: 'M' },
      opts: { attempts: 5 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job, new Error('exhausted'));

    expect(dlqQueue.add).toHaveBeenCalledTimes(1);
    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_dlq_total',
      1,
      expect.anything(),
    );
  });

  it('should include full job data and metadata in DLQ entry', async () => {
    const jobData = {
      userId: 'user-dlq',
      type: 'mention',
      title: 'You were mentioned',
      message: '@you check this out',
      metadata: { confessionId: 'c-99' },
    };
    const job = {
      name: 'send-notification',
      id: 'job-dlq-meta',
      attemptsMade: 3,
      data: jobData,
      opts: { attempts: 3 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job, new Error('perm fail'));

    expect(dlqQueue.add).toHaveBeenCalledWith(
      'dead-letter',
      expect.objectContaining({
        ...jobData,
        _meta: expect.objectContaining({
          originalJobId: 'job-dlq-meta',
          attemptsMade: 3,
          lastError: 'perm fail',
          failedAt: expect.any(String),
        }),
      }),
      expect.objectContaining({ removeOnComplete: false, removeOnFail: false }),
    );
  });

  it('should handle undefined job gracefully in onFailed', async () => {
    await processor.onFailed(undefined, new Error('no job'));

    expect(appLogger.incrementCounter).not.toHaveBeenCalled();
    expect(dlqQueue.add).not.toHaveBeenCalled();
  });

  it('should still process email when sendEmail throws (error propagates to BullMQ retry)', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-throw',
      attemptsMade: 0,
      data: { userId: 'user-throw', type: 'test', title: 'T', message: 'M' },
      opts: {},
    } as unknown as Job<NotificationJobData>;

    emailNotificationService.sendEmail.mockRejectedValue(
      new Error('SMTP connection refused'),
    );

    await expect(processor.process(job)).rejects.toThrow('SMTP connection refused');

    expect(emailNotificationService.sendEmail).toHaveBeenCalledWith(job.data);
  });

  it('should emit processing counter even when email fails after start', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-metrics-fail',
      attemptsMade: 0,
      data: { userId: 'user-mf', type: 'test', title: 'T', message: 'M' },
      opts: {},
    } as unknown as Job<NotificationJobData>;

    emailNotificationService.sendEmail.mockRejectedValue(
      new Error('timeout'),
    );

    await expect(processor.process(job)).rejects.toThrow();

    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_processing_total',
      1,
      expect.objectContaining({ queue: NOTIFICATION_QUEUE }),
    );
    // observeTimer is only called on success — when sendEmail throws, the timer is not observed
    expect(appLogger.observeTimer).not.toHaveBeenCalled();
  });

  it('does not mark a notification delivered when sending fails, so retry can deliver it', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-idempotent-retry',
      attemptsMade: 0,
      data: { userId: 'user-retry', type: 'test', title: 'T', message: 'M', idempotencyKey: 'event-42' },
      opts: { attempts: 3 },
    } as unknown as Job<NotificationJobData>;
    emailNotificationService.sendEmail
      .mockRejectedValueOnce(new Error('temporary SMTP failure'))
      .mockResolvedValueOnce(undefined);

    await expect(processor.process(job)).rejects.toThrow('temporary SMTP failure');
    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(emailNotificationService.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate event jobs across workers sharing Redis', async () => {
    const job = {
      name: 'send-notification',
      id: 'job-idempotent-duplicate',
      attemptsMade: 0,
      data: { userId: 'user-duplicate', type: 'test', title: 'T', message: 'M', idempotencyKey: 'event-99' },
      opts: { attempts: 3 },
    } as unknown as Job<NotificationJobData>;

    const secondWorker = new NotificationProcessor(
      emailNotificationService as unknown as EmailNotificationService,
      dlqQueue as unknown as Queue<NotificationJobData>,
      notificationQueue as unknown as Queue<NotificationJobData>,
      appLogger as unknown as AppLogger,
    );
    const duplicateJob = { ...job, id: 'job-idempotent-duplicate-2' } as Job<NotificationJobData>;
    const outcomes = await Promise.allSettled([
      processor.process(job),
      secondWorker.process(duplicateJob),
    ]);
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      await secondWorker.process(duplicateJob);
    }

    expect(emailNotificationService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('should process multiple jobs sequentially with independent retry tracking', async () => {
    const job1 = {
      name: 'send-notification',
      id: 'job-seq-1',
      attemptsMade: 2,
      data: { userId: 'u1', type: 'test', title: 'T', message: 'M' },
      opts: { attempts: 5 },
    } as unknown as Job<NotificationJobData>;

    const job2 = {
      name: 'send-notification',
      id: 'job-seq-2',
      attemptsMade: 5,
      data: { userId: 'u2', type: 'test', title: 'T', message: 'M' },
      opts: { attempts: 5 },
    } as unknown as Job<NotificationJobData>;

    await processor.onFailed(job1, new Error('retry'));
    await processor.onFailed(job2, new Error('exhausted'));

    // job1 should retry, job2 should go to DLQ
    expect(dlqQueue.add).toHaveBeenCalledTimes(1);
    expect(appLogger.incrementCounter).toHaveBeenCalledWith(
      'notification_queue_retry_total',
      1,
      expect.objectContaining({ attempt: 2 }),
    );
  });
});
