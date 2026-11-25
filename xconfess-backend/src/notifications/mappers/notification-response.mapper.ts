import { Notification } from '../entities/notification.entity';
import { NotificationResponseDto, PublicNotificationMetadataDto } from '../dto/notification-response.dto';

const PUBLIC_METADATA_KEYS = [
  'messageId',
  'messageCount',
  'messageIds',
  'commentId',
  'reactionId',
  'confessionId',
  'mentionedBy',
] as const;

export function toNotificationResponse(
  notification: Notification,
): NotificationResponseDto {
  const metadata = notification.metadata ?? {};
  const publicMetadata: PublicNotificationMetadataDto = {};

  for (const key of PUBLIC_METADATA_KEYS) {
    const value = metadata[key as keyof typeof metadata];
    if (value !== undefined && value !== null) {
      Object.assign(publicMetadata, { [key]: value });
    }
  }

  const response: NotificationResponseDto = {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };

  if (Object.keys(publicMetadata).length > 0) {
    response.metadata = publicMetadata;
  }

  return response;
}
