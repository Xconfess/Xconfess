import { ModerationEventsListener } from './moderation-events.listener';
import { ModerationStatus } from './ai-moderation.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { NotificationType } from 'src/notifications/entities/notification.entity';

describe('ModerationEventsListener', () => {
  let listener: ModerationEventsListener;
  let notificationService: {
    createNotification: jest.Mock;
  };
  let auditLogService: {
    log: jest.Mock;
  };
  let userRepository: {
    find: jest.Mock;
  };

  beforeEach(() => {
    notificationService = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    };
    auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      find: jest.fn().mockResolvedValue([{ id: 11 }, { id: 29 }]),
    };

    listener = new ModerationEventsListener(
      notificationService as any,
      auditLogService as any,
      userRepository as any,
    );
  });

  it('notifies all active admins when a confession requires review', async () => {
    await listener.handleRequiresReview({
      confessionId: 'conf-123',
      score: 0.64,
      flags: ['harassment'],
    });

    expect(userRepository.find).toHaveBeenCalled();
    expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(1, {
      type: NotificationType.SYSTEM,
      userId: '11',
      title: 'Confession Requires Moderation Review',
      message:
        'Confession conf-123 requires review. Score: 0.64, Flags: harassment',
      metadata: {
        confessionId: 'conf-123',
        score: 0.64,
        flags: ['harassment'],
        eventType: 'requires-review',
        moderationStatus: ModerationStatus.FLAGGED,
      },
    });
    expect(auditLogService.log).toHaveBeenCalledWith({
      actionType: AuditActionType.MODERATION_ESCALATION,
      metadata: {
        eventType: 'requires-review',
        confessionId: 'conf-123',
        score: 0.64,
        flags: ['harassment'],
      },
      context: { userId: null },
    });
  });

  it('notifies all active admins when a confession is rejected', async () => {
    await listener.handleHighSeverity({
      confessionId: 'conf-999',
      score: 0.98,
      flags: ['violence'],
    });

    expect(notificationService.createNotification).toHaveBeenCalledTimes(2);
    expect(notificationService.createNotification).toHaveBeenNthCalledWith(1, {
      type: NotificationType.SYSTEM,
      userId: '11',
      title: 'High-Severity Content Detected',
      message:
        'Confession conf-999 was rejected by moderation. Score: 0.98, Flags: violence',
      metadata: {
        confessionId: 'conf-999',
        score: 0.98,
        flags: ['violence'],
        eventType: 'high-severity',
        moderationStatus: ModerationStatus.REJECTED,
      },
    });
    expect(auditLogService.log).toHaveBeenCalledWith({
      actionType: AuditActionType.MODERATION_ESCALATION,
      metadata: {
        eventType: 'high-severity',
        confessionId: 'conf-999',
        score: 0.98,
        flags: ['violence'],
      },
      context: { userId: null },
    });
  });
});
