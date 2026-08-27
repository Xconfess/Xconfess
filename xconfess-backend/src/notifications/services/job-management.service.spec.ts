import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { JobManagementService } from './job-management.service';
import {
  NOTIFICATION_DLQ,
  NOTIFICATION_QUEUE,
  NotificationJobData,
} from '../processors/notification.processor';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AppLogger } from '../../logger/logger.service';

type MockJob = {
  id: string;
  name?: string;
  data: NotificationJobData;
  timestamp: number;
  attemptsMade?: number;
  failedReason?: string;
  finishedOn?: number;
  opts?: { attempts?: number };
  remove: jest.Mock<Promise<void>, []>;
  updateData: jest.Mock<Promise<void>, [NotificationJobData]>;
};

describe('JobManagementService', () => {
  let service: JobManagementService;
  let mainQueue: jest.Mocked<
    Pick<Queue<NotificationJobData>, 'add' | 'getJob' | 'getJobCounts'>
  >;
  let dlqQueue: jest.Mocked<
    Pick<Queue<NotificationJobData>, 'getJob' | 'getJobs' | 'getJobCounts'>
  >;
  let auditLogService: jest.Mocked<
    Pick<
      AuditLogService,
      'logNotificationDlqReplay' | 'logNotificationDlqCleanup'
    >
  >;
  let appLogger: jest.Mocked<Pick<AppLogger, 'emitEvent' | 'emitWarningEvent'>>;

  const buildJob = (
    id: string,
    overrides?: Partial<NotificationJobData>,
  ): MockJob => ({
    id,
    timestamp: Date.now(),
    remove: jest.fn().mockResolvedValue(undefined),
    updateData: jest.fn().mockResolvedValue(undefined),
    data: {
      userId: `user-${id}`,
      type: 'message_notification',
      title: `Job ${id}`,
      message: `payload-${id}`,
      metadata: { source: 'spec' },
      _meta: {
        originalJobId: `orig-${id}`,
        failedAt: '2026-04-24T10:00:00.000Z',
        attemptsMade: 5,
        lastError: 'SMTP timeout',
      },
      ...overrides,
    },
  });

  beforeEach(async () => {
    mainQueue = {
      add: jest.fn(),
      getJob: jest.fn(),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0 } as any),
    };
    dlqQueue = {
      getJob: jest.fn(),
      getJobs: jest.fn(),
      getJobCounts: jest.fn().mockResolvedValue({
        failed: 0,
        completed: 0,
        waiting: 0,
        active: 0,
        delayed: 0,
      } as any),
    };
    auditLogService = {
      logNotificationDlqReplay: jest.fn().mockResolvedValue(undefined),
      logNotificationDlqCleanup: jest.fn().mockResolvedValue(undefined),
    };
    appLogger = {
      emitEvent: jest.fn(),
      emitWarningEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobManagementService,
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: mainQueue,
        },
        {
          provide: getQueueToken(NOTIFICATION_DLQ),
          useValue: dlqQueue,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: unknown) => defaultValue),
          },
        },
        {
          provide: AuditLogService,
          useValue: auditLogService,
        },
        {
          provide: AppLogger,
          useValue: appLogger,
        },
      ],
    }).compile();

    service = module.get(JobManagementService);
  });

  it('lists DLQ jobs with UI-ready error details and pagination metadata', async () => {
    const enqueuedAt = Date.parse('2026-04-24T09:55:00.000Z');
    const dlqJob = {
      ...buildJob('dlq-list', {
        metadata: {
          channel: 'email',
          recipientEmail: 'operator@example.com',
        },
      }),
      name: 'dead-letter',
      timestamp: enqueuedAt,
      opts: { attempts: 6 },
    };
    dlqQueue.getJobs.mockResolvedValue([dlqJob as any]);
    dlqQueue.getJobCounts.mockResolvedValue({
      failed: 1,
      completed: 0,
      waiting: 0,
      active: 0,
      delayed: 0,
    } as any);

    const result = await service.listDlqJobs(1, 20);

    expect(dlqQueue.getJobs).toHaveBeenCalledWith(
      ['failed', 'completed', 'waiting', 'active', 'delayed'],
      0,
      19,
      true,
    );
    expect(result).toEqual({
      jobs: [
        expect.objectContaining({
          id: 'dlq-list',
          name: 'dead-letter',
          attemptsMade: 5,
          maxAttempts: 6,
          failedReason: 'SMTP timeout',
          failedAt: '2026-04-24T10:00:00.000Z',
          createdAt: '2026-04-24T09:55:00.000Z',
          channel: 'email',
          recipientEmail: 'operator@example.com',
          userId: 'user-dlq-list',
          type: 'message_notification',
          title: 'Job dlq-list',
          lastError: 'SMTP timeout',
          enqueuedAt,
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('replays bulk DLQ jobs with replay-safe deduplication and audit context', async () => {
    const replayableJob = buildJob('dlq-1');
    const duplicateJob = buildJob('dlq-2');

    dlqQueue.getJobs.mockResolvedValue([replayableJob as any, duplicateJob as any]);
    mainQueue.getJob
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce({ id: 'dlq-replay:orig-dlq-2' } as any);
    mainQueue.add.mockResolvedValue({ id: 'dlq-replay:orig-dlq-1' } as any);

    const result = await service.replayDlqJobsBulk(
      '42',
      { ids: 'dlq-1,dlq-2' },
      {
        requestId: 'req-dlq-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(result).toMatchObject({
      attempted: 2,
      replayed: 1,
      deduplicated: 1,
      failed: 0,
      noOp: false,
    });
    expect(mainQueue.add).toHaveBeenCalledWith(
      'send-notification',
      expect.objectContaining({
        userId: 'user-dlq-1',
        type: 'message_notification',
      }),
      {
        jobId: 'dlq-replay:orig-dlq-1',
      },
    );
    expect(replayableJob.updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        _meta: expect.objectContaining({
          replayJobId: 'dlq-replay:orig-dlq-1',
          replayOutcome: 'replayed',
          replayedAt: expect.any(String),
        }),
      }),
    );
    expect(duplicateJob.updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        _meta: expect.objectContaining({
          replayJobId: 'dlq-replay:orig-dlq-2',
          replayOutcome: 'deduplicated',
          replayedAt: expect.any(String),
        }),
      }),
    );
    expect(replayableJob.remove).toHaveBeenCalledTimes(1);
    expect(duplicateJob.remove).toHaveBeenCalledTimes(1);
    expect(auditLogService.logNotificationDlqReplay).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({
        replayType: 'bulk',
        targetJobIds: ['dlq-1', 'dlq-2'],
        summary: expect.objectContaining({
          attempted: 2,
          replayed: 1,
          deduplicated: 1,
          failed: 0,
        }),
        outcomes: expect.arrayContaining([
          expect.objectContaining({
            jobId: 'dlq-1',
            outcome: 'replayed',
          }),
          expect.objectContaining({
            jobId: 'dlq-2',
            outcome: 'deduplicated',
          }),
        ]),
      }),
      expect.objectContaining({
        requestId: 'req-dlq-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      }),
    );
  });

  it('records partial success for cleanup drain operations', async () => {
    const removableJob = buildJob('dlq-3');
    const stuckJob = buildJob('dlq-4');
    stuckJob.remove.mockRejectedValue(new Error('redis timeout'));

    dlqQueue.getJobs.mockResolvedValue([removableJob as any, stuckJob as any]);

    const result = await service.cleanupDlq(
      '7',
      { mode: 'drain', ids: 'dlq-3,dlq-4' },
      { requestId: 'req-cleanup-1' },
    );

    expect(result).toMatchObject({
      mode: 'drain',
      attempted: 2,
      removed: 1,
      failed: 1,
      noOp: false,
    });
    expect(auditLogService.logNotificationDlqCleanup).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({
        cleanupType: 'bulk',
        targetJobIds: ['dlq-3', 'dlq-4'],
        summary: expect.objectContaining({
          attempted: 2,
          removed: 1,
          failed: 1,
        }),
        outcomes: expect.arrayContaining([
          expect.objectContaining({
            jobId: 'dlq-3',
            outcome: 'removed',
          }),
          expect.objectContaining({
            jobId: 'dlq-4',
            outcome: 'failed',
            error: 'redis timeout',
          }),
        ]),
      }),
      expect.objectContaining({
        requestId: 'req-cleanup-1',
      }),
    );
    expect(appLogger.emitWarningEvent).toHaveBeenCalled();
  });

  it('treats repeated bulk replay with no matching DLQ jobs as a safe no-op', async () => {
    dlqQueue.getJobs.mockResolvedValue([]);

    const result = await service.replayDlqJobsBulk(
      '15',
      { ids: 'missing-1,missing-2' },
      { requestId: 'req-dlq-noop' },
    );

    expect(result).toMatchObject({
      attempted: 0,
      replayed: 0,
      deduplicated: 0,
      failed: 0,
      noOp: true,
      outcomes: [],
    });
    expect(mainQueue.add).not.toHaveBeenCalled();
    expect(auditLogService.logNotificationDlqReplay).toHaveBeenCalledWith(
      '15',
      expect.objectContaining({
        replayType: 'bulk',
        targetJobIds: [],
        summary: expect.objectContaining({
          attempted: 0,
          noOp: true,
        }),
      }),
      expect.objectContaining({
        requestId: 'req-dlq-noop',
      }),
    );
  });

  it('treats a previously marked replay as deduplicated even if the main queue job is gone', async () => {
    const staleReplayedJob = buildJob('dlq-5', {
      _meta: {
        originalJobId: 'orig-dlq-5',
        failedAt: '2026-04-24T10:00:00.000Z',
        attemptsMade: 5,
        lastError: 'SMTP timeout',
        replayJobId: 'dlq-replay:orig-dlq-5',
        replayedAt: '2026-04-25T11:00:00.000Z',
        replayOutcome: 'replayed',
      },
    });

    dlqQueue.getJobs.mockResolvedValue([staleReplayedJob as any]);

    const result = await service.replayDlqJobsBulk(
      '18',
      { ids: 'dlq-5' },
      { requestId: 'req-dlq-stale' },
    );

    expect(result).toMatchObject({
      attempted: 1,
      replayed: 0,
      deduplicated: 1,
      failed: 0,
      noOp: false,
    });
    expect(mainQueue.getJob).not.toHaveBeenCalled();
    expect(mainQueue.add).not.toHaveBeenCalled();
    expect(staleReplayedJob.remove).toHaveBeenCalledTimes(1);
    expect(auditLogService.logNotificationDlqReplay).toHaveBeenCalledWith(
      '18',
      expect.objectContaining({
        outcomes: expect.arrayContaining([
          expect.objectContaining({
            jobId: 'dlq-5',
            outcome: 'deduplicated',
            existingJobId: 'dlq-replay:orig-dlq-5',
          }),
        ]),
      }),
      expect.objectContaining({
        requestId: 'req-dlq-stale',
      }),
    );
  });
});