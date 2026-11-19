import { NotificationType } from '../entities/notification.entity';

export class PublicNotificationMetadataDto {
  messageId?: string;
  messageCount?: number;
  messageIds?: string[];
  commentId?: number;
  reactionId?: string;
  confessionId?: string;
  mentionedBy?: string;
}

export class NotificationResponseDto {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata?: PublicNotificationMetadataDto;
}
