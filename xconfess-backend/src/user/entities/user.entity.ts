import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum NotificationCategory {
  MESSAGE = 'message',
  REACTION = 'reaction',
  MODERATION = 'moderation',
  SYSTEM = 'system',
}

export interface PrivacySettings {
  isDiscoverable: boolean;
  canReceiveReplies: boolean;
  showReactions: boolean;
}

@Entity()
@Unique(['username'])
@Unique(['emailHash'])
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  username!: string;

  @Column()
  password!: string;

  @Column({ name: 'email_encrypted', type: 'text' })
  emailEncrypted!: string;

  @Column({ name: 'email_iv', type: 'varchar', length: 32 })
  emailIv!: string;

  @Column({ name: 'email_tag', type: 'varchar', length: 32 })
  emailTag!: string;

  @Column({ name: 'email_hash', type: 'varchar', length: 64, unique: true })
  emailHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resetPasswordToken!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetPasswordExpires!: Date | null;

  @Column({
    name: 'notification_preferences',
    type: 'jsonb',
    default: () => "'{}'",
  })
  notificationPreferences!: Partial<Record<NotificationCategory, boolean>>;

  @Column({
    name: 'privacy_settings',
    type: 'jsonb',
    default: () =>
      '\'{"isDiscoverable": true, "canReceiveReplies": true, "showReactions": true}\'',
  })
  privacySettings!: PrivacySettings;

  isNotificationEnabled(category: NotificationCategory): boolean {
    if (!this.notificationPreferences) return true;

    const value = this.notificationPreferences[category];
    return value !== false;
  }

  isDiscoverable(): boolean {
    if (!this.privacySettings) return true;
    return this.privacySettings.isDiscoverable !== false;
  }

  canReceiveReplies(): boolean {
    if (!this.privacySettings) return true;
    return this.privacySettings.canReceiveReplies !== false;
  }

  shouldShowReactions(): boolean {
    if (!this.privacySettings) return true;
    return this.privacySettings.showReactions !== false;
  }

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  getEmail(): string {
    if (!this.emailEncrypted || !this.emailIv || !this.emailTag) return '';
    const { CryptoUtil } = require('../../common/crypto.util');
    return CryptoUtil.decrypt(this.emailEncrypted, this.emailIv, this.emailTag);
  }
}
