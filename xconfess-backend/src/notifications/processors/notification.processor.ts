import { Processor, OnWorkerEvent, InjectQueue, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { EmailNotificationService } from '../services/email-notification.service';
import { NotificationType } from '../entities/notification.entity';
import { AppLogger } from '../../logger/logger.service';
import { redactSecretStrings } from '../../utils/redact-secrets';

export const NOTIFICATION_QUEUE = 'notifications';
export const NOTIFICATION_DLQ = 'notifications-dlq';

export interface NotificationJobData {
  userId: string;
  type: string; // Unified with NotificationType or string
  title: string;
  message: string;
  /** Stable idempotency key — prevents duplicate delivery across retries (#1980). */
  idempotencyKey?: string;
  notificationId?: string;
  /** Correlation ID from originating request — links background jobs to initiating operation. */
  requestId?: string;
  metadata?: any;
  _meta?: {
    originalJobId: string | undefined;
    failedAt: string;
    attemptsMade: number;
    lastError: string;
    lastErrorClass?: string;
    replayJobId?: string;
    replayedAt?: string;
    replayOutcome?: 'replayed' | 'deduplicated';
    /** Number of times this job has been replayed from the DLQ (#1981). */
    replayCount?: number;
  };
}

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly emailNotificationService: EmailNotificationService,
    @InjectQueue(NOTIFICATION_DLQ)
    private readonly dlq: Queue<NotificationJobData>,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue<NotificationJobData>,
    private readonly appLogger: AppLogger,
  ) {
    super();
  }

  // ------------------------------------------------------------------ process
  async process(job: Job<NotificationJobData>): Promise<void> {
    if (job.name === 'send-notification') {
      const idempotencyKey = job.data.idempotencyKey;

      this.logger.log(
        `Processing notification job ${job.id} (attempt ${job.attemptsMade + 1})` +
          ` → userId: ${job.data.userId}` +
          `${job.data.requestId ? ` requestId: ${job.data.requestId}` : ''}`,
      );

      this.appLogger.incrementCounter('notification_queue_processing_total', 1, {
        queue: NOTIFICATION_QUEUE,
        jobName: job.name,
      });

      const startedAt = Date.now();
      if (idempotencyKey) {
        const delivered = await this.deliverIdempotently(
          idempotencyKey,
          () => this.emailNotificationService.sendEmail(job.data),
        );
        if (!delivered) {
          this.logger.log(`Skipping duplicate notification job ${job.id}`);
          return;
        }
      } else {
        await this.emailNotificationService.sendEmail(job.data);
      }
      this.appLogger.observeTimer(
        'notification_queue_processing_duration_ms',
        Date.now() - startedAt,
        {
          queue: NOTIFICATION_QUEUE,
          jobName: job.name,
        },
      );
    }
  }

  // --------------------------------------------------------------- on:failed
  /**
   * Called after every failed attempt.
   * When all attempts are exhausted BullMQ marks the job "failed" — we then
   * copy the full payload + error context into the dead-letter queue.
   */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<NotificationJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;

    const maxAttempts = (job.opts as any)?.attempts ?? 1;

    const safeError = redactSecretStrings(error.message)
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, 500);
    this.logger.warn(
      `Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${safeError}`,
    );

    const isExhausted = job.attemptsMade >= maxAttempts;

    if (!isExhausted) {
      this.appLogger.incrementCounter('notification_queue_retry_total', 1, {
        queue: NOTIFICATION_QUEUE,
        jobName: job.name,
        attempt: job.attemptsMade,
      });
    } else {
      this.appLogger.incrementCounter('notification_queue_failure_total', 1, {
        queue: NOTIFICATION_QUEUE,
        jobName: job.name,
      });
      this.appLogger.incrementCounter('notification_queue_dlq_total', 1, {
        queue: NOTIFICATION_QUEUE,
        jobName: job.name,
      });

      this.logger.error(
        `Job ${job.id} exhausted all retries — moving to DLQ`,
      );

      await this.dlq.add(
        'dead-letter',
        {
          ...job.data,
          _meta: {
            originalJobId: String(job.id),
            failedAt: new Date().toISOString(),
            attemptsMade: job.attemptsMade,
            lastError: safeError,
            lastErrorClass: error.name || 'Error',
          },
        },
        {
          jobId: `notification-${createHash('sha256').update(String(job.id)).digest('hex')}`,
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
    }
  }

  // -------------------------------------------------------------- on:completed
  @OnWorkerEvent('completed')
  onCompleted(job: Job<NotificationJobData> | undefined): void {
    if (job) {
      this.logger.log(`Job ${job.id} completed successfully`);
    }
  }

  // --------------------------------------------------------- idempotency (#2000)
  /**
   * A Redis lock serializes duplicate event jobs across worker processes. The
   * delivered marker is written only after sendEmail succeeds, so a transient
   * delivery failure releases the lock and remains retryable.
   */
  private async deliverIdempotently(
    idempotencyKey: string,
    deliver: () => Promise<unknown>,
  ): Promise<boolean> {
    const digest = createHash('sha256').update(idempotencyKey).digest('hex');
    const deliveredKey = `notification:delivered:${digest}`;
    const lockKey = `notification:processing:${digest}`;
    const redis = await this.notificationQueue.client;

    if (await redis.get(deliveredKey)) return false;

    const lockToken = randomUUID();
    const lock = await redis.set(lockKey, lockToken, 'PX', 5 * 60 * 1000, 'NX');
    if (lock !== 'OK') {
      if (await redis.get(deliveredKey)) return false;
      // Let BullMQ retry this job after the active worker releases the lock.
      throw new Error('Notification with this event key is already being delivered.');
    }

    try {
      await deliver();
      await redis.set(deliveredKey, '1', 'EX', 30 * 24 * 60 * 60);
      return true;
    } finally {
      await redis.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        lockKey,
        lockToken,
      );
    }
  }
}
