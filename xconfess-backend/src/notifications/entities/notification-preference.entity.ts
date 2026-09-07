import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // In-app notification preferences
  @Column({ default: true })
  enableInAppNotifications: boolean;

  @Column({ default: true })
  inAppNewMessage: boolean;

  @Column({ default: true })
  inAppMessageBatch: boolean;

  // Email notification preferences
  @Column({ default: true })
  enableEmailNotifications: boolean;

  @Column({ default: true })
  emailNewMessage: boolean;

  @Column({ default: true })
  emailMessageBatch: boolean;

  @Column({ type: 'varchar', nullable: true })
  emailAddress: string;

  // Batching settings
  @Column({ default: 5 })
  batchWindowMinutes: number; // Group notifications within this window

  @Column({ default: 3 })
  batchThreshold: number; // Minimum messages to trigger batch notification

  // Quiet hours
  @Column({ default: false })
  enableQuietHours: boolean;

  @Column({ type: 'time', nullable: true })
  quietHoursStart: string; // Format: 'HH:MM:SS'

  @Column({ type: 'time', nullable: true })
  quietHoursEnd: string; // Format: 'HH:MM:SS'

  @Column({ type: 'varchar', nullable: true })
  timezone: string; // e.g., 'America/New_York'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
