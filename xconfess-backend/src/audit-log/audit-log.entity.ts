import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/entities/user.entity';

export enum AuditActionType {
  // Content moderation actions
  CONFESSION_DELETE = 'confession_delete',
  COMMENT_DELETE = 'comment_delete',
  CONFESSION_DELETED = 'confession_deleted',
  COMMENT_DELETED = 'comment_deleted',
  CONFESSION_HIDDEN = 'confession_hidden',
  CONFESSION_UNHIDDEN = 'confession_unhidden',
  COMMENT_APPROVED = 'comment_approved',
  COMMENT_REJECTED = 'comment_rejected',

  // Report actions
  REPORT_CREATED = 'report_created',
  REPORT_RESOLVED = 'report_resolved',
  REPORT_DISMISSED = 'report_dismissed',

  // Auth actions
  FAILED_LOGIN = 'failed_login',

  // Notification actions
  NOTIFICATION_SUPPRESSED = 'notification_suppressed',
  NOTIFICATION_DLQ_REPLAY = 'notification_dlq_replay',
  NOTIFICATION_DLQ_CLEANUP = 'notification_dlq_cleanup',

  // Moderation
  MODERATION_ESCALATION = 'moderation_escalation',
  MODERATION_OVERRIDE = 'moderation_override',
  BULK_ACTION = 'bulk_action',

  // User actions
  USER_BANNED = 'user_banned',
  USER_UNBANNED = 'user_unbanned',
  USER_ADMIN_GRANTED = 'user_admin_granted',
  USER_ADMIN_REVOKED = 'user_admin_revoked',

  // Email template rollout actions
  EMAIL_TEMPLATE_DELIVERED = 'email_template_delivered',
  EMAIL_TEMPLATE_FAILED = 'email_template_failed',
  EMAIL_TEMPLATE_PROMOTED = 'email_template_promoted',
  EMAIL_TEMPLATE_ROLLED_BACK = 'email_template_rolled_back',

  // Template state management
  TEMPLATE_STATE_TRANSITION = 'template_state_transition',
  TEMPLATE_ROLLOUT_KILLSWITCH = 'template_rollout_killswitch',
  TEMPLATE_FALLBACK_ACTIVATED = 'template_fallback_activated',
  TEMPLATE_ROLLOUT_DIFF_RECORDED = 'template_rollout_diff_recorded',

  // Data export lifecycle
  EXPORT_REQUEST_CREATED = 'export_request_created',
  EXPORT_GENERATION_COMPLETED = 'export_generation_completed',
  EXPORT_LINK_REFRESHED = 'export_link_refreshed',
  EXPORT_DOWNLOADED = 'export_downloaded',
  EXPORT_TOKEN_EXPIRED = 'export_token_expired',   // <-- ADDED
  EXPORT_EXPIRED = 'export_expired',               // <-- ADDED

  // Admin CSV export actions initiated from the frontend
  ADMIN_CSV_EXPORT = 'admin_csv_export',

  /** Privileged Stellar server-signed contract invocation */
  STELLAR_CONTRACT_INVOCATION = 'stellar_contract_invocation',

  // Stellar Anchor Retry Logic
  STELLAR_ANCHOR_RETRY = 'stellar_anchor_retry',
  STELLAR_ANCHOR_FAILED = 'stellar_anchor_failed',
  TIP_RECONCILIATION_DEAD_LETTER = 'tip_reconciliation_dead_letter',
}

@Entity('audit_logs')
@Index(['adminId'])
@Index(['action'])
@Index(['createdAt'])
@Index(['entityType', 'entityId'])
@Index(['requestId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'admin_id', type: 'int', nullable: true })
  adminId: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin: User | null;

  @Column({
    type: 'enum',
    enum: AuditActionType,
  })
  action: AuditActionType;

  @Column({ name: 'entity_type', type: 'varchar', nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'varchar', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  metadata: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId: string | null;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamp with time zone' })
  createdAt: Date;

  get userId(): number | null {
    return this.adminId;
  }

  set userId(value: number | string | null) {
    if (value === null || value === undefined || value === '') {
      this.adminId = null;
      return;
    }

    const normalized =
      typeof value === 'number' ? value : Number.parseInt(value, 10);
    this.adminId = Number.isInteger(normalized) ? normalized : null;
  }

  get user(): User | null {
    return this.admin;
  }

  set user(value: User | null) {
    this.admin = value;
  }

  get actionType(): AuditActionType {
    return this.action;
  }

  set actionType(value: AuditActionType) {
    this.action = value;
  }

  get timestamp(): Date {
    return this.createdAt;
  }

  set timestamp(value: Date) {
    this.createdAt = value;
  }
}
