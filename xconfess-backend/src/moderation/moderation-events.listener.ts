import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../notifications/services/notification.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { ModerationStatus } from './ai-moderation.service';
import { UserRole } from '../user/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';

interface HighSeverityEvent {
  confessionId: string;
  userId?: string;
  score: number;
  flags: string[];
}

interface RequiresReviewEvent {
  confessionId: string;
  userId?: string;
  score: number;
  flags: string[];
}

@Injectable()
export class ModerationEventsListener {
  private readonly logger = new Logger(ModerationEventsListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @OnEvent('moderation.high-severity')
  async handleHighSeverity(event: HighSeverityEvent) {
    this.logger.warn(
      `HIGH SEVERITY CONTENT DETECTED - Confession: ${event.confessionId}, ` +
        `Score: ${event.score}, Flags: ${event.flags.join(', ')}`,
    );
    try {
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
    } catch (err: any) {
      this.logger.error(
        `Failed to escalate high-severity moderation event: ${err.message}`,
      );
      throw err;
    }
  }

  @OnEvent('moderation.requires-review')
  async handleRequiresReview(event: RequiresReviewEvent) {
    this.logger.log(
      `Content flagged for review - Confession: ${event.confessionId}, ` +
        `Score: ${event.score}, Flags: ${event.flags.join(', ')}`,
    );
    try {
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
    } catch (err: any) {
      this.logger.error(
        `Failed to escalate requires-review moderation event: ${err.message}`,
      );
      throw err;
    }
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
