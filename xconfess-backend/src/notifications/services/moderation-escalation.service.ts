import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from './notification.service';
import { NotificationType } from '../entities/notification.entity';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditActionType } from '../../audit-log/audit-log.entity';
import { User, UserRole } from '../../user/entities/user.entity';
import { ModerationStatus } from '../../moderation/ai-moderation.service';

interface EscalationEvent {
  confessionId: string;
  userId?: string;
  score: number;
  flags: string[];
}

@Injectable()
export class ModerationEscalationService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async escalateHighSeverity(event: EscalationEvent): Promise<void> {
    await this.notifyActiveAdmins({
      title: 'High-Severity Content Detected',
      message: `Confession ${event.confessionId} was rejected by moderation. Score: ${event.score}, Flags: ${event.flags.join(', ')}`,
      metadata: {
        confessionId: event.confessionId,
        score: event.score,
        flags: event.flags,
        eventType: 'high-severity',
        moderationStatus: ModerationStatus.REJECTED,
      },
    });
    await this.auditLogService.log({
      actionType: AuditActionType.MODERATION_ESCALATION,
      metadata: {
        eventType: 'high-severity',
        confessionId: event.confessionId,
        score: event.score,
        flags: event.flags,
      },
      context: { userId: event.userId || null },
    });
  }

  async escalateRequiresReview(event: EscalationEvent): Promise<void> {
    await this.notifyActiveAdmins({
      title: 'Confession Requires Moderation Review',
      message: `Confession ${event.confessionId} requires review. Score: ${event.score}, Flags: ${event.flags.join(', ')}`,
      metadata: {
        confessionId: event.confessionId,
        score: event.score,
        flags: event.flags,
        eventType: 'requires-review',
        moderationStatus: ModerationStatus.FLAGGED,
      },
    });
    await this.auditLogService.log({
      actionType: AuditActionType.MODERATION_ESCALATION,
      metadata: {
        eventType: 'requires-review',
        confessionId: event.confessionId,
        score: event.score,
        flags: event.flags,
      },
      context: { userId: event.userId || null },
    });
  }

  private async notifyActiveAdmins(params: {
    title: string;
    message: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const admins = await this.userRepository.find({
      where: { role: UserRole.ADMIN, is_active: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.notificationService.createNotification({
          type: NotificationType.SYSTEM,
          userId: String(admin.id),
          title: params.title,
          message: params.message,
          metadata: params.metadata,
        }),
      ),
    );
  }
}