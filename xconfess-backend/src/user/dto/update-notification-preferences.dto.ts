import { IsOptional, IsBoolean, IsString, IsObject } from 'class-validator';

export class NotificationChannelPreferences {
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class UpdateNotificationPreferencesDto {
  // Category preferences (category → { inApp, email, push })
  @IsOptional()
  @IsObject()
  reactions?: NotificationChannelPreferences;

  @IsOptional()
  @IsObject()
  comments?: NotificationChannelPreferences;

  @IsOptional()
  @IsObject()
  mentions?: NotificationChannelPreferences;

  @IsOptional()
  @IsObject()
  tips?: NotificationChannelPreferences;

  @IsOptional()
  @IsObject()
  reports?: NotificationChannelPreferences;

  @IsOptional()
  @IsObject()
  system?: NotificationChannelPreferences;

  // Legacy flat boolean fields (for backward compatibility)
  @IsOptional()
  @IsBoolean()
  message?: boolean;

  @IsOptional()
  @IsBoolean()
  reaction?: boolean;

  @IsOptional()
  @IsBoolean()
  moderation?: boolean;

  // Quiet hours
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

export class NotificationPreferencesResponse {
  reactions: NotificationChannelPreferences;
  comments: NotificationChannelPreferences;
  mentions: NotificationChannelPreferences;
  tips: NotificationChannelPreferences;
  reports: NotificationChannelPreferences;
  system: NotificationChannelPreferences;
  enableQuietHours: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
}
