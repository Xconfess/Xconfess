import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from '../../user/entities/user.entity';

export enum NotificationType {
  NEW_MESSAGE = "new_message",
  MESSAGE_BATCH = "message_batch",
  SYSTEM = "system",
  MENTION = "mention",
  COMMENT_REPLY = "comment_reply",
}

@Entity("notifications")
// Composite index backing the recipient feed (`getUserNotifications`) and
// unread-count queries (`{ userId, isRead: false }`) — see migration
// AddAuthFeedNotificationsAuditIndexes20260827000001 for the DB-level index
// this declaration documents (idx_notifications_user_feed).
@Index(["userId", "isRead", "createdAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    type: "enum",
    enum: NotificationType,
    default: NotificationType.NEW_MESSAGE,
  })
  type: NotificationType;

  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("text")
  title: string;

  @Column("text")
  message: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: {
    messageId?: string;
    senderId?: string;
    senderAnonymousId?: string;
    messageCount?: number;
    messageIds?: string[];
    commentId?: number;
    reactionId?: string;
    confessionId?: string;
    mentionedBy?: string;
    sourceEventId?: string;
  };

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index({ unique: true })
  sourceKey: string | null;

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: "timestamp", nullable: true })
  readAt: Date;

  @Column({ default: false })
  isEmailSent: boolean;

  @Column({ type: "timestamp", nullable: true })
  emailSentAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
