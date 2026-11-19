import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AnonymousConfession } from '../../confession/entities/confession.entity';

export enum TipVerificationStatus {
  PENDING = 'pending',
  STALE_PENDING = 'stale_pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  CONFLICT = 'conflict',
}

@Entity('tips')
export class Tip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'confession_id', type: 'uuid' })
  @Index()
  confessionId: string;

  @ManyToOne(() => AnonymousConfession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'confession_id' })
  confession: AnonymousConfession;

  @Column({ type: 'decimal', precision: 20, scale: 7 })
  amount: number;

  @Column({ name: 'tx_id', type: 'varchar', length: 64, unique: true })
  @Index()
  txId: string;

  /**
   * SHA-256(confessionId:txId) — DB-enforced uniqueness prevents double-credit
   * on concurrent verify calls hitting the same (confession, tx) pair.
   * The partial unique index in the migration covers only non-NULL values so
   * reconciliation rows that start without a key don't collide.
   */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  @Index({ unique: true })
  idempotencyKey: string | null;

  @Column({
    name: 'sender_address',
    type: 'varchar',
    length: 56,
    nullable: true,
  })
  senderAddress: string | null;

  @Column({
    name: 'verification_status',
    type: 'enum',
    enum: TipVerificationStatus,
    default: TipVerificationStatus.VERIFIED,
  })
  verificationStatus: TipVerificationStatus;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'last_chain_status', type: 'varchar', length: 50, nullable: true })
  lastChainStatus: string | null;

  @Column({ name: 'last_checked_at', type: 'timestamp', nullable: true })
  lastCheckedAt: Date | null;

  @Column({ name: 'reconciliation_metadata', type: 'jsonb', nullable: true })
  reconciliationMetadata: Record<string, any> | null;

  @Column({ name: 'processing_lock', type: 'varchar', length: 64, nullable: true })
  processingLock: string | null;

  @Column({ name: 'locked_at', type: 'timestamp', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'locked_by', type: 'varchar', length: 100, nullable: true })
  lockedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({
    name: 'submission_status',
    type: 'varchar',
    length: 50,
    default: 'submitted',
  })
  submissionStatus: string;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'failed_at', type: 'timestamp', nullable: true })
  failedAt: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ name: 'expiry_block_height', type: 'bigint', nullable: true })
  expiryBlockHeight: number | null;

  @Column({ name: 'ledger_sequence', type: 'bigint', nullable: true })
  ledgerSequence: number | null;

  @Column({ name: 'soroban_metadata', type: 'jsonb', nullable: true })
  sorobanMetadata: Record<string, any> | null;
}
