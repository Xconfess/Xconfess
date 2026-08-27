import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TemplateLifecycleState {
  DRAFT = 'draft',
  CANARY = 'canary',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived',
}

@Entity('template_versions')
@Index(['templateKey', 'version'], { unique: true })
export class TemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_key' })
  templateKey: string;

  @Column()
  version: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'required_vars', type: 'jsonb', default: [] })
  requiredVars: string[];

  @Column({
    type: 'enum',
    enum: TemplateLifecycleState,
    default: TemplateLifecycleState.DRAFT,
    name: 'lifecycle_state',
  })
  lifecycleState: TemplateLifecycleState;

  @Column({ type: 'jsonb', default: [], name: 'state_history' })
  stateHistory: Array<{
    from: TemplateLifecycleState;
    to: TemplateLifecycleState;
    timestamp: string;
    reason?: string;
    actorId?: string;
  }>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
