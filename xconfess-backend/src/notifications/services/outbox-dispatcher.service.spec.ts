import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import {
  OutboxEvent,
  OutboxStatus,
} from '../../common/entities/outbox-event.entity';
import { NotificationService } from './notification.service';
import { Repository } from 'typeorm';

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
            enqueueNotification: jest.fn(),
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
});
