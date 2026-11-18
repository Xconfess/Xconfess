import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { getMetadataArgsStorage } from 'typeorm';
import { NotificationService } from './notification.service';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NOTIFICATION_QUEUE } from '../processors/notification.processor';
import { AppLogger } from '../../logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { User } from '../../user/entities/user.entity';
import { RequestContextStorage } from '../../common/request-context';

/**
 * Regression coverage for the notification recipient/read/status query
 * patterns optimized by the #1986 indexes:
 *
 *  - idx_notifications_recipient_created       (userId, createdAt DESC)
 *  - idx_notifications_recipient_unread        (userId, isRead)
 *  - idx_notifications_recipient_type_unread   (userId, type, isRead, createdAt DESC)
 *
 * If any of these query shapes change, the matching index stops being used and
 * these assertions fail, prompting a new migration review.
 */
describe('NotificationService — indexed query patterns (#1986)', () => {
  let service: NotificationService;

  const notificationRepoMock = {
    findAndCount: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const preferenceRepoMock = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const userRepoMock = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    notificationRepoMock.findAndCount.mockResolvedValue([[], 0]);
    notificationRepoMock.count.mockResolvedValue(0);
    notificationRepoMock.find.mockResolvedValue([]);
    notificationRepoMock.findOne.mockResolvedValue(null);
    notificationRepoMock.create.mockImplementation((n) => ({ id: 'n1', ...n }));
    notificationRepoMock.save.mockImplementation(async (n) => n);
    notificationRepoMock.update.mockResolvedValue({ affected: 0 });
    preferenceRepoMock.create.mockImplementation((p) => p);
    preferenceRepoMock.save.mockImplementation(async (p) => p);
    userRepoMock.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationRepoMock,
        },
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: preferenceRepoMock,
        },
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        },
        {
          provide: AppLogger,
          useValue: { incrementCounter: jest.fn(), warn: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'ENABLE_BACKGROUND_JOBS' ? 'false' : undefined,
            ),
          },
        },
        {
          provide: RequestContextStorage,
          useValue: {
            getRequestId: jest.fn().mockReturnValue(undefined),
            setRequestId: jest.fn(),
            clear: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('recipient feed (idx_notifications_recipient_created)', () => {
    it('queries by recipient and orders by createdAt DESC with bounded paging', async () => {
      await service.getUserNotifications('user-1', { page: 1, limit: 20 });

      expect(notificationRepoMock.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('derives skip/take from the requested page', async () => {
      await service.getUserNotifications('user-1', { page: 3, limit: 10 });

      expect(notificationRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('unread access paths (idx_notifications_recipient_unread)', () => {
    it('filters unread-only feeds by recipient + isRead=false', async () => {
      await service.getUserNotifications('user-1', {
        page: 1,
        limit: 20,
        unreadOnly: true,
      });

      expect(notificationRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', isRead: false },
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('computes the unread badge count by recipient + isRead=false', async () => {
      await service.getUserNotifications('user-1', { page: 1, limit: 20 });

      expect(notificationRepoMock.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
    });

    it('marks all unread notifications for a recipient', async () => {
      await service.markAllAsRead('user-1');

      expect(notificationRepoMock.update).toHaveBeenCalledWith(
        { userId: 'user-1', isRead: false },
        expect.objectContaining({ isRead: true }),
      );
    });
  });

  describe('message batching window (idx_notifications_recipient_type_unread)', () => {
    it('scans recent unread message notifications for a recipient', async () => {
      preferenceRepoMock.findOne.mockResolvedValue({
        userId: 'user-1',
        enableInAppNotifications: true,
        enableEmailNotifications: false,
        inAppNewMessage: true,
        emailNewMessage: false,
        enableQuietHours: false,
        batchWindowMinutes: 5,
        batchThreshold: 5,
      });

      await service.createMessageNotification(
        'user-1',
        'sender-1',
        'msg-1',
        'hi',
      );

      const findCall = notificationRepoMock.find.mock.calls[0][0];
      expect(findCall.where).toMatchObject({
        userId: 'user-1',
        type: NotificationType.NEW_MESSAGE,
        isRead: false,
      });
      // createdAt uses a MoreThan(windowStart) operator instance.
      expect(findCall.where.createdAt).toBeDefined();
      expect(findCall.order).toEqual({ createdAt: 'DESC' });
    });
  });

  describe('entity index declaration', () => {
    it('keeps the recipient/read/createdAt composite index on the entity', () => {
      const declared = getMetadataArgsStorage()
        .indices.filter((index) => index.target === Notification)
        .map((index) => index.columns as string[]);

      expect(declared).toEqual(
        expect.arrayContaining([['userId', 'isRead', 'createdAt']]),
      );
    });
  });
});
