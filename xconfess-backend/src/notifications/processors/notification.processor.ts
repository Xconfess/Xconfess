import { Processor, OnWorkerEvent, InjectQueue, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { EmailNotificationService } from '../services/email-notification.service';
import { NotificationType } from '../entities/notification.entity';
import { AppLogger } from '../../logger/logger.service';

export const NOTIFICATION_QUEUE = 'notifications';
export const NOTIFICATION_DLQ = 'notifications-dlq';

export interface NotificationJobData {
  userId: string;
  type: string; // Unified with NotificationType or string
  title: string;
  message: string;
  metadata?: any;
  _meta?: {
    originalJobId: string | undefined;
    failedAt: string;
    attemptsMade: number;
    lastError: string;
    replayJobId?: string;
    replayedAt?: string;
    replayOutcome?: 'replayed' | 'deduplicated';
  };
}

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly emailNotificationService: EmailNotificationService,
    @InjectQueue(NOTIFICATION_DLQ)
    private readonly dlq: Queue<NotificationJobData>,
    private readonly appLogger: AppLogger,
  ) {
    super();
  }

  // ------------------------------------------------------------------ process
  async process(job: Job<NotificationJobData>): Promise<void> {
    if (job.name === 'send-notification') {
      this.logger.log(
        `Processing notification job ${job.id} (attempt ${job.attemptsMade + 1})` +
          ` → userId: ${job.data.userId}`,
      );

      this.appLogger.incrementCounter('notification_queue_processing_total', 1, {
        queue: NOTIFICATION_QUEUE,
        jobName: job.name,
      });

      const startedAt = Date.now();
      await this.emailNotificationService.sendEmail(job.data);
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

    this.logger.warn(
      `Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`,
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
        error.stack,
      );

      await this.dlq.add(
        'dead-letter',
        {
          ...job.data,
          _meta: {
            originalJobId: String(job.id),
            failedAt: new Date().toISOString(),
            attemptsMade: job.attemptsMade,
            lastError: error.message,
          },
        },
        {
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
}
