import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
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

describe('NotificationService', () => {
  let service: NotificationService;
  let queueMock: { add: jest.Mock };
  let preferenceRepoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let notificationRepoMock: { create: jest.Mock; save: jest.Mock };
  let appLoggerMock: { incrementCounter: jest.Mock };
  let userRepoMock: { findOne: jest.Mock };

  beforeEach(async () => {
    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    appLoggerMock = {
      incrementCounter: jest.fn(),
    };

    preferenceRepoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((p) => p),
      save: jest.fn().mockImplementation(async (p) => p),
    };

    notificationRepoMock = {
      create: jest.fn().mockImplementation((n) => ({ id: 'notif-1', ...n })),
      save: jest.fn().mockImplementation(async (n) => n),
    };

    userRepoMock = {
      findOne: jest.fn().mockResolvedValue(null),
    };

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
        {
          provide: getRepositoryToken(User),
          useValue: userRepoMock,
        },
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: queueMock,
        },
        {
          provide: AppLogger,
          useValue: {
            incrementCounter: jest.fn(),
            warn: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'ENABLE_BACKGROUND_JOBS' ? 'true' : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    appLoggerMock = module.get<AppLogger>(AppLogger) as any;
  });

  describe('createNotification', () => {
    it('should dispatch an email job to the queue if preferences allow it', async () => {
      // Arrange
      preferenceRepoMock.findOne.mockResolvedValue({
        userId: 'user-1',
        enableInAppNotifications: true,
        enableEmailNotifications: true,
        emailAddress: 'test@example.com',
        inAppNewMessage: true,
        emailNewMessage: true,
        enableQuietHours: false,
      });

      // Act
      await service.createNotification({
        userId: 'user-1',
        type: NotificationType.NEW_MESSAGE,
        title: 'Title',
        message: 'Message',
      });

      // Assert
      expect(queueMock.add).toHaveBeenCalledTimes(1);
      expect(queueMock.add).toHaveBeenCalledWith(
        'send-notification',
        {
          notificationId: 'notif-1',
          userId: 'user-1',
        },
        { jobId: 'email-notif-1' },
      );
    });

    it('should not dispatch an email job if email notifications are disabled', async () => {
      // Arrange
      preferenceRepoMock.findOne.mockResolvedValue({
        userId: 'user-1',
        enableInAppNotifications: true,
        enableEmailNotifications: false,
        emailAddress: 'test@example.com',
        inAppNewMessage: true,
        emailNewMessage: true,
        enableQuietHours: false,
      });

      // Act
      await service.createNotification({
        userId: 'user-1',
        type: NotificationType.NEW_MESSAGE,
        title: 'Title',
        message: 'Message',
      });

      // Assert
      expect(queueMock.add).not.toHaveBeenCalled();
    });

    it('should emit queue enqueue metrics when scheduling a notification job', async () => {
      // Arrange
      preferenceRepoMock.findOne.mockResolvedValue({
        userId: 'user-1',
        enableInAppNotifications: true,
        enableEmailNotifications: true,
        emailAddress: 'test@example.com',
        inAppNewMessage: true,
        emailNewMessage: true,
        enableQuietHours: false,
      });

      // Act
      await service.createNotification({
        userId: 'user-1',
        type: NotificationType.NEW_MESSAGE,
        title: 'Title',
        message: 'Message',
      });

      // Assert
      expect(queueMock.add).toHaveBeenCalledTimes(1);
      expect(appLoggerMock.incrementCounter).toHaveBeenCalledWith(
        'notification_queue_enqueued_total',
        1,
        expect.objectContaining({
          queue: NOTIFICATION_QUEUE,
          jobName: 'send-notification',
          notificationType: NotificationType.NEW_MESSAGE,
        }),
      );
    });
  });
});
