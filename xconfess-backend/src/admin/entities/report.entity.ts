import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AnonymousConfession } from '../../confession/entities/confession.entity';
import { User } from '../../user/entities/user.entity';
import { AnonymousUser } from '../../user/entities/anonymous-user.entity';

export enum ReportType {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  HATE_SPEECH = 'hate_speech',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  COPYRIGHT = 'copyright',
  OTHER = 'other',
}

export enum ReportStatus {
  PENDING = 'pending',
  REVIEWING = 'reviewing',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Entity('reports')
@Index(['confessionId'])
@Index(['reporterId'])
@Index(['status'])
@Index(['createdAt'])
@Index(['idempotencyKey'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'confession_id' })
  confessionId: string;

  @ManyToOne(() => AnonymousConfession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'confession_id' })
  confession: AnonymousConfession;

  @Column({ name: 'reporter_id', type: 'int', nullable: true })
  reporterId: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User | null;

  @Column({ name: 'anonymous_reporter_id', type: 'uuid', nullable: true })
  anonymousReporterId: string | null;

  @ManyToOne(() => AnonymousUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'anonymous_reporter_id' })
  anonymousReporter: AnonymousUser | null;

  @Column({
    type: 'enum',
    enum: ReportType,
  })
  type: ReportType;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.PENDING,
  })
  status: ReportStatus;

  @Column({ name: 'resolved_by', type: 'int', nullable: true })
  resolvedBy: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolver: User | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolution_reason', type: 'text', nullable: true })
  resolutionNotes: string | null;

  @Column({ name: 'template_id', type: 'int', nullable: true })
  templateId: number | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  idempotencyKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
