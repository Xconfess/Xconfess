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

export class NotificationQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean = false;
}
