import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Comment } from './comment.entity';
import { User } from '../../user/entities/user.entity';

export enum ModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FLAGGED = 'flagged',
  ESCALATED = 'escalated',
  RESOLVED = 'resolved',
  HIDDEN = 'hidden',
}

@Entity('moderation_comments')
export class ModerationComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  commentId: number;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'commentId' })
  comment: Comment;

  @Column({
    type: 'varchar',
    length: 16,
    default: ModerationStatus.PENDING,
  })
  status: ModerationStatus;

  @Column({ type: 'timestamp', nullable: true })
  moderatedAt?: Date;

  @Column({ type: 'int', nullable: true })
  moderatedById?: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'moderatedBy' })
  moderatedBy?: User;

  @CreateDateColumn()
  createdAt: Date;
}
