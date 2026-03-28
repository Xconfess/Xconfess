import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NOTIFICATION_QUEUE } from '../processors/notification.processor';
import {
  CreateNotificationDto,
  NotificationQueryDto,
} from '../dto/notification.dto';
import { Queue } from 'bull';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private preferenceRepository: Repository<NotificationPreference>,
    @InjectQueue(NOTIFICATION_QUEUE)
    private notificationQueue: Queue,
  ) {}

  async enqueueNotification(
    type: string,
    payload: any,
    jobId?: string,
  ): Promise<void> {
    await this.notificationQueue.add(
      'send-notification',
      {
        ...payload,
        type,
      },
      { jobId },
    );
  }

  async createNotification(
    dto: CreateNotificationDto,
  ): Promise<Notification | null> {
    const preference = await this.getUserPreference(dto.userId);

    // Check if user wants this type of notification
    if (!this.shouldSendNotification(preference, dto.type)) {
      return null;
    }

    // Check if we're in quiet hours
    if (this.isQuietHours(preference)) {
      return null;
    }

    const notification = this.notificationRepository.create(dto);
    await this.notificationRepository.save(notification);

    // Queue for email notification if enabled
    if (
      preference.enableEmailNotifications &&
      this.shouldSendEmail(preference, dto.type)
    ) {
      await this.notificationQueue.add(
        'send-notification',
        {
          notificationId: notification.id,
          userId: dto.userId,
        },
        { jobId: `email-${notification.id}` },
      );
    }

    return notification;
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

  private isQuietHours(preference: NotificationPreference): boolean {
    if (
      !preference.enableQuietHours ||
      !preference.quietHoursStart ||
      !preference.quietHoursEnd
    ) {
      return false;
    }

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS

    // Simple time comparison (can be enhanced with timezone support)
    return (
      currentTime >= preference.quietHoursStart &&
      currentTime <= preference.quietHoursEnd
    );
  }
}
