import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsEmail,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/pagination';
import { NotificationType } from '../entities/notification.entity';

export class CreateNotificationDto {
  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  userId: string;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsString()
  sourceKey?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  enableInAppNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppNewMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppMessageBatch?: boolean;

  @IsOptional()
  @IsBoolean()
  enableEmailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNewMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  emailMessageBatch?: boolean;

  @IsOptional()
  @IsEmail()
  emailAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  batchWindowMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(20)
  batchThreshold?: number;

  @IsOptional()
  @IsBoolean()
  enableQuietHours?: boolean;

  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  quietHoursEnd?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

/**
 * Query params for GET /notifications.
 *
 * Extends the shared PaginationDto so the notification feed enforces exactly
 * the same page/limit bounds as every other list endpoint (Issue #2117).
 * The response shape (`{ notifications, total, unreadCount }`) is unchanged.
 */
export class NotificationQueryDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean({ message: 'unreadOnly must be a boolean.' })
  unreadOnly?: boolean = false;
}
