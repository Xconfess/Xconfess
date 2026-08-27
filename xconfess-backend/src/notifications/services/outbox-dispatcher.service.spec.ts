import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import {
  OutboxEvent,
  OutboxStatus,
} from '../../common/entities/outbox-event.entity';
import { NotificationService } from './notification.service';
import { Repository } from 'typeorm';
import { NotificationDeliveryState } from '../delivery-state';

describe('OutboxDispatcherService', () => {
  let service: OutboxDispatcherService;
  let outboxRepo: Repository<OutboxEvent>;
  let notificationService: NotificationService;

  const mockOutboxEvent = {
    id: 'test-uuid',
    type: 'message_notification',
    payload: { message: 'hello' },
    status: OutboxStatus.PENDING,
    retryCount: 0,
  } as OutboxEvent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxDispatcherService,
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: {
            manager: {
              transaction: jest.fn(),
            },
            save: jest.fn(),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            enqueueNotification: jest.fn().mockResolvedValue({
              state: NotificationDeliveryState.QUEUED,
              queue: 'notifications',
              jobName: 'send-notification',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OutboxDispatcherService>(OutboxDispatcherService);
    outboxRepo = module.get<Repository<OutboxEvent>>(
      getRepositoryToken(OutboxEvent),
    );
    notificationService = module.get<NotificationService>(NotificationService);
  });

  it('should claim and process events in a transaction with SKIP LOCKED', async () => {
    const transactionManagerMock = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockOutboxEvent]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };

    (outboxRepo.manager.transaction as jest.Mock).mockImplementation(
      async (cb) => {
        return await cb(transactionManagerMock);
      },
    );

    // Manually trigger handleOutbox (it's normally cron-triggered)
    // We need to bypass the isProcessing check if we run it multiple times, but here it's first run.
    await service.handleOutbox();

    expect(outboxRepo.manager.transaction).toHaveBeenCalled();
    expect(transactionManagerMock.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
    );
    expect(transactionManagerMock.setOnLocked).toHaveBeenCalledWith(
      'skip_locked',
    );

    expect(notificationService.enqueueNotification).toHaveBeenCalledWith(
      mockOutboxEvent.type,
      mockOutboxEvent.payload,
      mockOutboxEvent.id,
    );

    expect(outboxRepo.save).toHaveBeenCalled();
  });

  it('should skip notification dispatch when idempotencyKey is already COMPLETED', async () => {
    const duplicateEvent = {
      id: 'event-2',
      type: 'message_notification',
      payload: { message: 'hello' },
      status: OutboxStatus.PENDING,
      idempotencyKey: 'ik-100',
      retryCount: 0,
    } as OutboxEvent;

    const existingCompleted = {
      id: 'event-1',
      idempotencyKey: 'ik-100',
      status: OutboxStatus.COMPLETED,
    } as OutboxEvent;

    outboxRepo.findOne = jest.fn().mockResolvedValue(existingCompleted);

    const transactionManagerMock = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([duplicateEvent]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };

    (outboxRepo.manager.transaction as jest.Mock).mockImplementation(
      async (cb) => {
        return await cb(transactionManagerMock);
      },
    );

    await service.handleOutbox();

    expect(outboxRepo.findOne).toHaveBeenCalledWith({
      where: {
        idempotencyKey: 'ik-100',
        status: OutboxStatus.COMPLETED,
      },
    });
    expect(notificationService.enqueueNotification).not.toHaveBeenCalled();
    expect(duplicateEvent.status).toBe(OutboxStatus.COMPLETED);
    expect(outboxRepo.save).toHaveBeenCalledWith(duplicateEvent);
  });

  it('marks outbox events as skipped when background jobs are disabled', async () => {
    const skippedEvent = {
      id: 'event-skipped',
      type: 'message_notification',
      payload: { message: 'hello' },
      status: OutboxStatus.PENDING,
      retryCount: 0,
    } as OutboxEvent;

    (notificationService.enqueueNotification as jest.Mock).mockResolvedValue({
      state: NotificationDeliveryState.SKIPPED,
      reason: 'background_jobs_disabled',
      queue: 'notifications',
      jobId: 'event-skipped',
    });

    const transactionManagerMock = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([skippedEvent]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };

    (outboxRepo.manager.transaction as jest.Mock).mockImplementation(
      async (cb) => cb(transactionManagerMock),
    );

    await service.handleOutbox();

    expect(skippedEvent.status).toBe(OutboxStatus.SKIPPED);
    expect(skippedEvent.lastError).toBe('background_jobs_disabled');
    expect(skippedEvent.processedAt).toBeInstanceOf(Date);
    expect(outboxRepo.save).toHaveBeenCalledWith(skippedEvent);
  });
});
