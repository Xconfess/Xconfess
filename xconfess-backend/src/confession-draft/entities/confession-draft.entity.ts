import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  VersionColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum ConfessionDraftStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  POSTED = 'posted',
}

@Entity('confession_drafts')
export class ConfessionDraft {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('text')
  content: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category: string | null;

  @Index()
  @Column({ name: 'scheduled_for', type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  @Column({ name: 'timezone', type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: ConfessionDraftStatus,
    default: ConfessionDraftStatus.DRAFT,
  })
  status: ConfessionDraftStatus;

  @Column({ name: 'publish_attempts', type: 'int', default: 0 })
  publishAttempts: number;

  @Column({ name: 'last_publish_error', type: 'text', nullable: true })
  lastPublishError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @Column({ type: 'jsonb', default: [] })
  revisions: { content: string; version: number; createdAt: Date }[];
}
