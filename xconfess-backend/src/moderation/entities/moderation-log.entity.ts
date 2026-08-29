import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ModerationCategory, ModerationStatus } from '../ai-moderation.service';

@Entity('moderation_logs')
export class ModerationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'confession_id', type: 'varchar', nullable: true })
  confessionId: string;

  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId: string;

  @Column('text')
  content: string;

  @Column('decimal', { precision: 5, scale: 4 })
  moderationScore: number;

  @Column('simple-array')
  moderationFlags: ModerationCategory[];

  @Column({
    type: 'enum',
    enum: ModerationStatus,
    default: ModerationStatus.PENDING,
  })
  moderationStatus: ModerationStatus;

  @Column('json', { nullable: true })
  details: Record<string, number>;

  @Column({ default: false })
  requiresReview: boolean;

  @Column({ default: false })
  reviewed: boolean;

  @Column({ name: 'reviewed_by', type: 'varchar', nullable: true })
  reviewedBy: string;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date;

  @Column('text', { nullable: true })
  reviewNotes: string;

  @Column({ name: 'auto_actioned', default: false })
  autoActioned: boolean;

  @Column({ type: 'varchar', nullable: true })
  apiProvider: string;

  @Column('json', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
