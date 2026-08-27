import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum TemplateCategory {
  APPROVAL = 'approval',
  REJECTION = 'rejection',
  WARNING = 'warning',
  INFO = 'info',
}

@Entity('moderation_note_templates')
export class ModerationNoteTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: TemplateCategory,
    default: TemplateCategory.INFO,
  })
  category: TemplateCategory;

  @Column({ default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
