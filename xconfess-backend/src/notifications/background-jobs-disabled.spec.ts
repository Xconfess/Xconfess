import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { ServiceUnavailableException } from '@nestjs/common';
import { NotificationService } from './services/notification.service';
import { NOTIFICATION_QUEUE } from './processors/notification.processor';
import { NotificationDeliveryState } from './delivery-state';

describe('Background Jobs Disabled Behavior', () => {
  describe('NotificationService.enqueueNotification', () => {
    let service: NotificationService;
    let mockQueue: { add: jest.Mock };
    let mockLogger: { warn: jest.Mock; incrementCounter: jest.Mock };
    let mockConfigService: { get: jest.Mock };

    beforeEach(async () => {
      mockQueue = { add: jest.fn() };
      mockLogger = {
        warn: jest.fn(),
        incrementCounter: jest.fn(),
      };
      mockConfigService = {
        get: jest.fn().mockReturnValue('false'),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: NotificationService,
            useFactory: () => {
              const svc = Object.create(NotificationService.prototype);
              svc.notificationQueue = mockQueue;
              svc.appLogger = mockLogger;
              svc.configService = mockConfigService;
              svc.notificationRepository = {};
              svc.preferenceRepository = {};
              svc.userRepository = {};
              return svc;
            },
          },
        ],
      }).compile();

      service = module.get(NotificationService);
    });

    it('should not enqueue when ENABLE_BACKGROUND_JOBS is not true', async () => {
      const outcome = await service.enqueueNotification('message_notification', {
        userId: 'user-1',
        requestId: 'req-abc',
      });

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(outcome).toEqual({
        state: NotificationDeliveryState.SKIPPED,
        reason: 'background_jobs_disabled',
        queue: NOTIFICATION_QUEUE,
        jobId: undefined,
      });
    });

    it('should log a structured warning with queue name when jobs are disabled', async () => {
      await service.enqueueNotification(
        'message_notification',
        { requestId: 'req-xyz' },
        'job-123',
      );

      expect(mockLogger.warn).toHaveBeenCalled();
      const logMessage = mockLogger.warn.mock.calls[0][0];
      expect(logMessage).toContain('[BackgroundJobDisabled]');
      expect(logMessage).toContain(NOTIFICATION_QUEUE);
      expect(logMessage).toContain('req-xyz');
    });

    it('should enqueue normally when ENABLE_BACKGROUND_JOBS is true', async () => {
      mockConfigService.get.mockReturnValue('true');
      (service as any).shouldDeliverEmail = jest.fn().mockResolvedValue(true);

      const outcome = await service.enqueueNotification('message_notification', {
        userId: 'user-1',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-notification',
        expect.objectContaining({ type: 'message_notification' }),
        expect.anything(),
      );
      expect(outcome).toEqual({
        state: NotificationDeliveryState.QUEUED,
        queue: NOTIFICATION_QUEUE,
        jobName: 'send-notification',
        jobId: undefined,
      });
    });
  });
});
