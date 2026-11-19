import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AnonymousUser } from '../../user/entities/anonymous-user.entity';

export enum AttachmentStatus {
  UPLOADING = 'uploading',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABANDONED = 'abandoned',
}

export enum AttachmentType {
  IMAGE = 'image',
  DOCUMENT = 'document',
  AUDIO = 'audio',
  VIDEO = 'video',
  OTHER = 'other',
}

@Entity('attachments')
@Index(['status', 'createdAt'])
@Index(['objectKey'])
@Index(['anonymousUserId', 'status'])
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  objectKey: string;

  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'bigint' })
  size: number;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({
    type: 'enum',
    enum: AttachmentType,
    default: AttachmentType.OTHER,
  })
  type: AttachmentType;

  @Column({
    type: 'enum',
    enum: AttachmentStatus,
    default: AttachmentStatus.UPLOADING,
  })
  status: AttachmentStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  checksum: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @ManyToOne(() => AnonymousUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'anonymous_user_id' })
  anonymousUser: AnonymousUser | null;

  @Column({ name: 'anonymous_user_id', type: 'uuid', nullable: true })
  anonymousUserId: string | null;

  @Column({ name: 'confession_id', type: 'uuid', nullable: true })
  confessionId: string | null;

  @Column({ name: 'message_id', type: 'int', nullable: true })
  messageId: number | null;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'failed_at', type: 'timestamp', nullable: true })
  failedAt: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;
}