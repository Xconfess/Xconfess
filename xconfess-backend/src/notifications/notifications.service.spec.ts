import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import {
  NotificationProcessor,
  NOTIFICATION_DLQ,
  NotificationJobData,
} from './processors/notification.processor';
import { EmailNotificationService } from './services/email-notification.service';
import { NotificationType } from './entities/notification.entity';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeJob(
  overrides: Partial<Job<NotificationJobData>> = {},
): Job<NotificationJobData> {
  return {
    id: 'job-1',
    timestamp: Date.now(),
    data: {
      userId: 'user-uuid-123',
      type: NotificationType.NEW_MESSAGE,
      title: 'New message',
      message: 'You have a new confession',
      metadata: { senderId: 'sender-uuid' },
    },
    attemptsMade: 1,
    opts: { attempts: 5 },
    ...overrides,
  } as unknown as Job<NotificationJobData>;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let emailNotificationService: jest.Mocked<EmailNotificationService>;
  let dlqMock: jest.Mocked<Pick<Queue, 'add'>>;

  beforeEach(async () => {
    dlqMock = { add: jest.fn().mockResolvedValue({ id: 'dlq-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        {
          provide: EmailNotificationService,
          useValue: { sendEmail: jest.fn() },
        },
        {
          provide: getQueueToken(NOTIFICATION_DLQ),
          useValue: dlqMock,
        },
      ],
    }).compile();

    processor = module.get(NotificationProcessor);
    emailNotificationService = module.get(EmailNotificationService);
  });

  // ── process ────────────────────────────────────────────────────────────────

  it('calls emailNotificationService.sendEmail with correct job data', async () => {
    const job = makeJob();
    await processor.handleSendNotification(job);
    expect(emailNotificationService.sendEmail).toHaveBeenCalledWith(job.data);
  });

  it('propagates email errors so Bull can retry', async () => {
    emailNotificationService.sendEmail.mockRejectedValueOnce(
      new Error('SMTP timeout'),
    );
    const job = makeJob();
    await expect(processor.handleSendNotification(job)).rejects.toThrow(
      'SMTP timeout',
    );
  });

  // ── onFailed — non-exhausted ───────────────────────────────────────────────

  it('does NOT move to DLQ when retries remain', async () => {
    const job = makeJob({ attemptsMade: 2, opts: { attempts: 5 } });
    await processor.onFailed(job, new Error('Transient'));
    expect(dlqMock.add).not.toHaveBeenCalled();
  });

  // ── onFailed — exhausted ──────────────────────────────────────────────────

  it('moves job to DLQ when all attempts are exhausted', async () => {
    const error = new Error('Permanent failure');
    const job = makeJob({
      id: 'job-99',
      attemptsMade: 5,
      opts: { attempts: 5 },
    });

    await processor.onFailed(job, error);

    expect(dlqMock.add).toHaveBeenCalledTimes(1);

    const [jobName, dlqPayload, dlqOpts] = dlqMock.add.mock.calls[0];

    expect(jobName).toBe('dead-letter');

    // Original fields preserved
    expect(dlqPayload.userId).toBe('user-uuid-123');
    expect(dlqPayload.type).toBe(NotificationType.NEW_MESSAGE);

    // _meta block populated correctly
    expect(dlqPayload._meta).toMatchObject({
      originalJobId: 'job-99',
      attemptsMade: 5,
      lastError: 'Permanent failure',
    });
    expect(dlqPayload._meta.failedAt).toBeTruthy();

    // DLQ jobs must be retained for ops inspection
    expect(dlqOpts).toMatchObject({
      removeOnComplete: false,
      removeOnFail: false,
    });
  });

  // ── onCompleted ───────────────────────────────────────────────────────────

  it('logs completion without throwing', () => {
    const job = makeJob();
    expect(() => processor.onCompleted(job)).not.toThrow();
  });
});
