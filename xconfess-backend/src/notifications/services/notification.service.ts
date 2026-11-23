import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NOTIFICATION_QUEUE } from '../processors/notification.processor';
import { CreateNotificationDto, NotificationQueryDto } from '../dto/notification.dto';
import { Queue } from 'bullmq';
import { AppLogger } from '../../logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { User } from '../../user/entities/user.entity';
import {
  NotificationDeliveryOutcome,
  NotificationDeliveryState,
} from '../delivery-state';
import { RequestContextStorage } from '../../common/request-context';
import { createHash } from 'node:crypto';

interface ChannelPreferences {
  inApp?: boolean;
  email?: boolean;
  push?: boolean;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private preferenceRepository: Repository<NotificationPreference>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectQueue(NOTIFICATION_QUEUE)
    private notificationQueue: Queue,
    private readonly appLogger: AppLogger,
    private readonly configService: ConfigService,
    private readonly requestContextStorage: RequestContextStorage,
  ) {}

  async enqueueNotification(
    type: string,
    payload: any,
    jobId?: string,
  ): Promise<NotificationDeliveryOutcome> {
    if (this.configService.get<string>('ENABLE_BACKGROUND_JOBS') !== 'true') {
      const requestId =
        payload?.requestId || payload?.messageId || jobId || 'unknown';
      this.appLogger.warn(
        `[BackgroundJobDisabled] Enqueue skipped for queue "${NOTIFICATION_QUEUE}": type=${type} requestId=${requestId} jobId=${jobId || 'none'}`,
        'NotificationService',
      );
      this.appLogger.incrementCounter('notification_delivery_skipped_total', 1, {
        queue: NOTIFICATION_QUEUE,
        notificationType: type,
        reason: 'background_jobs_disabled',
      });
      return {
        state: NotificationDeliveryState.SKIPPED,
        reason: 'background_jobs_disabled',
        queue: NOTIFICATION_QUEUE,
        jobId,
      };
    }

    const userId = payload?.userId || payload?.recipientId;
    if (userId) {
      const canDeliver = await this.shouldDeliverEmail(userId, type);
      if (!canDeliver) {
        this.appLogger.warn(
          `enqueueNotification skipped (email preference disabled): type=${type} userId=${userId}`,
          'NotificationService',
        );
        this.appLogger.incrementCounter('notification_delivery_skipped_total', 1, {
          queue: NOTIFICATION_QUEUE,
          notificationType: type,
          reason: 'email_preference_disabled',
        });
        return {
          state: NotificationDeliveryState.SKIPPED,
          reason: 'email_preference_disabled',
          queue: NOTIFICATION_QUEUE,
          jobId,
        };
      }
    }

    const requestId = this.requestContextStorage.getRequestId();
    const eventKey =
      payload?.idempotencyKey ||
      payload?.sourceKey ||
      payload?.notificationId ||
      payload?.messageId ||
      jobId;
    const stableJobId =
      jobId ||
      (eventKey
        ? `notification-${createHash('sha256')
            .update(`${userId || 'unknown'}:${type}:${String(eventKey)}`)
            .digest('hex')}`
        : undefined);
    await this.notificationQueue.add(
      'send-notification',
      {
        ...payload,
        type,
        ...(eventKey && { idempotencyKey: String(eventKey) }),
        ...(requestId && { requestId }),
      },
      { jobId: stableJobId },
    );

    this.appLogger.incrementCounter('notification_queue_enqueued_total', 1, {
      queue: NOTIFICATION_QUEUE,
      jobName: 'send-notification',
      notificationType: type,
    });

    return {
      state: NotificationDeliveryState.QUEUED,
      queue: NOTIFICATION_QUEUE,
      jobName: 'send-notification',
      jobId,
    };
  }

  /**
   * Check whether a user should receive a realtime (in-app/WebSocket) notification.
   * Pulls fresh preferences from DB to avoid stale cached decisions.
   */
  async shouldDeliverRealtime(userId: string, type: string): Promise<boolean> {
    try {
      const preference = await this.getUserPreference(userId);
      if (!preference.enableInAppNotifications) return false;

      const channelPrefs = await this.getUserChannelPreferences(
        userId,
        type as NotificationType,
      );
      if (channelPrefs && !channelPrefs.inApp) return false;

      if (this.isQuietHours(preference)) return false;
      if (await this.isQuietHoursForUser(userId)) return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check whether a user should receive an email notification.
   * Pulls fresh preferences from DB to avoid stale cached decisions.
   */
  async shouldDeliverEmail(userId: string, type: string): Promise<boolean> {
    try {
      const preference = await this.getUserPreference(userId);
      if (!preference.enableEmailNotifications || !preference.emailAddress) {
        return false;
      }

      if (
        type === NotificationType.NEW_MESSAGE &&
        !preference.emailNewMessage
      ) {
        return false;
      }
      if (
        type === NotificationType.MESSAGE_BATCH &&
        !preference.emailMessageBatch
      ) {
        return false;
      }

      const channelPrefs = await this.getUserChannelPreferences(
        userId,
        type as NotificationType,
      );
      if (channelPrefs && !channelPrefs.email) return false;

      return true;
    } catch {
      return false;
    }
  }

  async createNotification(
    dto: CreateNotificationDto,
  ): Promise<Notification | null> {
    const preference = await this.getUserPreference(dto.userId);

    // Check if user wants this type of notification (NotificationPreference table)
    if (!this.shouldSendNotification(preference, dto.type)) {
      return null;
    }

    // Check user-level notification preferences (category × channel matrix)
    const channelPrefs = await this.getUserChannelPreferences(dto.userId, dto.type);
    if (channelPrefs && !channelPrefs.inApp) {
      return null;
    }

    // Check if we're in quiet hours (check both preference systems)
    if (this.isQuietHours(preference)) {
      return null;
    }
    if (await this.isQuietHoursForUser(dto.userId)) {
      return null;
    }

    const sourceKey = dto.sourceKey ?? this.buildSourceKey(dto);
    if (sourceKey) {
      const existing = await this.notificationRepository.findOne({
        where: { sourceKey },
      });
      if (existing) {
        this.appLogger.incrementCounter('notification_duplicate_suppressed_total', 1, {
          notificationType: dto.type,
        });
        return existing;
      }
    }

    const notification = this.notificationRepository.create({
      ...dto,
      sourceKey: sourceKey ?? undefined,
    });
    try {
      await this.notificationRepository.save(notification);
    } catch (error) {
      if (sourceKey && this.isUniqueViolation(error)) {
        const existing = await this.notificationRepository.findOne({
          where: { sourceKey },
        });
        if (existing) {
          this.appLogger.incrementCounter(
            'notification_duplicate_suppressed_total',
            1,
            { notificationType: dto.type },
          );
          return existing;
        }
      }
      throw error;
    }

    // Queue for email notification if enabled and background jobs are active
    if (
      preference.enableEmailNotifications &&
      this.shouldSendEmail(preference, dto.type) &&
      (channelPrefs ? channelPrefs.email : true) &&
      this.configService.get<string>('ENABLE_BACKGROUND_JOBS') === 'true'
    ) {
      await this.notificationQueue.add(
        'send-notification',
        {
          notificationId: notification.id,
          userId: dto.userId,
          type: dto.type,
          title: notification.title,
          message: notification.message,
          metadata: notification.metadata,
          idempotencyKey: sourceKey ?? notification.id,
        },
        { jobId: `email-${notification.id}` },
      );

      this.appLogger.incrementCounter('notification_queue_enqueued_total', 1, {
        queue: NOTIFICATION_QUEUE,
        jobName: 'send-notification',
        notificationType: dto.type,
      });
    } else if (this.configService.get<string>('ENABLE_BACKGROUND_JOBS') !== 'true') {
      this.appLogger.warn(
        `[BackgroundJobDisabled] Email enqueue skipped for notification ${notification.id}: type=${dto.type} userId=${dto.userId}`,
        'NotificationService',
      );
      this.appLogger.incrementCounter('notification_delivery_skipped_total', 1, {
        queue: NOTIFICATION_QUEUE,
        notificationType: dto.type,
        reason: 'background_jobs_disabled',
      });
    }

    return notification;
  }

  private buildSourceKey(dto: CreateNotificationDto): string | null {
    if (dto.sourceKey) {
      return dto.sourceKey;
    }

    if (dto.idempotencyKey) {
      return `${dto.userId}:${dto.type}:${dto.idempotencyKey}`;
    }

    const metadata = dto.metadata || {};

    // 1. Explicit idempotency or event deduplication keys
    const explicitKey =
      metadata.idempotencyKey ||
      metadata.deduplicationKey ||
      metadata.sourceEventId ||
      metadata.eventId;
    if (explicitKey) {
      return `${dto.userId}:${dto.type}:${String(explicitKey)}`;
    }

    // 2. Action / event differentiation
    const action = metadata.eventType || metadata.action || '';

    // 3. Entity-specific identifiers
    const entityId =
      metadata.messageId ||
      metadata.commentId ||
      metadata.reactionId ||
      metadata.tipId ||
      metadata.badgeId ||
      metadata.reportId;
    if (entityId) {
      return action
        ? `${dto.userId}:${dto.type}:${action}:${String(entityId)}`
        : `${dto.userId}:${dto.type}:${String(entityId)}`;
    }

    // 4. Confession-scoped events (e.g., moderation events, status transitions)
    if (metadata.confessionId) {
      const subAction = action || 'confession';
      return `${dto.userId}:${dto.type}:${subAction}:${String(metadata.confessionId)}`;
    }

    // 5. Generic action with target identifier
    if (action) {
      const targetId = metadata.targetId || metadata.referenceId || metadata.subjectId;
      if (targetId) {
        return `${dto.userId}:${dto.type}:${action}:${String(targetId)}`;
      }
      return `${dto.userId}:${dto.type}:${action}`;
    }

    return null;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const driverError = (error as { driverError?: { code?: string } })
      .driverError;
    const code = (error as { code?: string }).code || driverError?.code;
    return code === '23505';
  }

  async createMessageNotification(
    userId: string,
    senderId: string,
    messageId: string,
    messagePreview: string,
  ): Promise<void> {
    const preference = await this.getUserPreference(userId);

    // Check for recent notifications to determine if we should batch
    const recentNotifications = await this.getRecentMessageNotifications(
      userId,
      preference.batchWindowMinutes,
    );

    if (recentNotifications.length >= preference.batchThreshold - 1) {
      // Create batch notification
      await this.createBatchNotification(
        userId,
        recentNotifications,
        messageId,
      );
    } else {
      // Create individual notification
      await this.createNotification({
        type: NotificationType.NEW_MESSAGE,
        userId,
        title: 'New Message',
        message: messagePreview,
        metadata: {
          messageId,
          senderId,
        },
      });
    }
  }

  private async createBatchNotification(
    userId: string,
    recentNotifications: Notification[],
    newMessageId: string,
  ): Promise<void> {
    const messageIds = [
      ...recentNotifications.map((n) => n.metadata?.messageId).filter(Boolean),
      newMessageId,
    ];

    const count = messageIds.length;

    // Create batch notification
    await this.createNotification({
      type: NotificationType.MESSAGE_BATCH,
      userId,
      title: `${count} New Messages`,
      message: `You have ${count} unread messages`,
      metadata: {
        messageCount: count,
        messageIds,
      },
    });

    // Mark individual notifications as read to avoid duplicates
    await this.notificationRepository.update(
      recentNotifications.map((n) => n.id),
      { isRead: true, readAt: new Date() },
    );
  }

  async getUserNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const { page, limit, unreadOnly } = query;
    const pageNum = page && page > 0 ? page : 1;
    const limitNum = limit && limit > 0 ? limit : 20;
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = { userId };
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const [notifications, total] =
      await this.notificationRepository.findAndCount({
        where: whereClause,
        order: { createdAt: 'DESC' },
        skip,
        take: limitNum,
      });

    const unreadCount = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });

    return { notifications, total, unreadCount };
  }

  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  async getUserPreference(userId: string): Promise<NotificationPreference> {
    let preference = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preference) {
      preference = this.preferenceRepository.create({ userId });
      await this.preferenceRepository.save(preference);
    }

    return preference;
  }

  async updateUserPreference(
    userId: string,
    updates: Partial<NotificationPreference>,
  ): Promise<NotificationPreference> {
    const preference = await this.getUserPreference(userId);
    Object.assign(preference, updates);
    return this.preferenceRepository.save(preference);
  }

  private async getRecentMessageNotifications(
    userId: string,
    windowMinutes: number,
  ): Promise<Notification[]> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    return this.notificationRepository.find({
      where: {
        userId,
        type: NotificationType.NEW_MESSAGE,
        createdAt: MoreThan(windowStart),
        isRead: false,
      },
      order: { createdAt: 'DESC' },
    });
  }

  private getCategoryKey(type: NotificationType): string | null {
    switch (type) {
      case NotificationType.NEW_MESSAGE:
      case NotificationType.MESSAGE_BATCH:
        return 'messages';
      case NotificationType.MENTION:
        return 'mentions';
      case NotificationType.COMMENT_REPLY:
        return 'comments';
      case NotificationType.SYSTEM:
        return 'system';
      default:
        return null;
    }
  }

  private async getUserChannelPreferences(
    userId: string,
    type: NotificationType,
  ): Promise<{ inApp: boolean; email: boolean; push: boolean } | null> {
    try {
      const user = await this.userRepository.findOne({ where: { id: Number(userId) } });
      if (!user) return null;

      const prefs = user.notificationPreferences || {};
      const categoryKey = this.getCategoryKey(type);
      if (!categoryKey) return null;

      const channels: ChannelPreferences = prefs[categoryKey];
      if (!channels) return null;

      return {
        inApp: channels.inApp !== false,
        email: channels.email !== false,
        push: channels.push !== false,
      };
    } catch {
      return null;
    }
  }

  private shouldSendNotification(
    preference: NotificationPreference,
    type: NotificationType,
  ): boolean {
    if (!preference.enableInAppNotifications) return false;

    switch (type) {
      case NotificationType.NEW_MESSAGE:
        return preference.inAppNewMessage;
      case NotificationType.MESSAGE_BATCH:
        return preference.inAppMessageBatch;
      default:
        return true;
    }
  }

  private shouldSendEmail(
    preference: NotificationPreference,
    type: NotificationType,
  ): boolean {
    if (!preference.enableEmailNotifications || !preference.emailAddress)
      return false;

    switch (type) {
      case NotificationType.NEW_MESSAGE:
        return preference.emailNewMessage;
      case NotificationType.MESSAGE_BATCH:
        return preference.emailMessageBatch;
      default:
        return false;
    }
  }

  private async isQuietHoursForUser(userId: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({ where: { id: Number(userId) } });
      if (!user) return false;

      const prefs = user.notificationPreferences || {};
      if (!prefs.enableQuietHours) return false;

      const quietStart: string = prefs.quietHoursStart;
      const quietEnd: string = prefs.quietHoursEnd;
      if (!quietStart || !quietEnd) return false;

      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 8);
      return currentTime >= quietStart && currentTime <= quietEnd;
    } catch {
      return false;
    }
  }

  private isQuietHours(preference: NotificationPreference): boolean {
    if (
      !preference.enableQuietHours ||
      !preference.quietHoursStart ||
      !preference.quietHoursEnd
    ) {
      return false;
    }

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8);

    return (
      currentTime >= preference.quietHoursStart &&
      currentTime <= preference.quietHoursEnd
    );
  }
}
