import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AnchorStatus {
  PENDING = 'pending',
  /**
   * OBSERVED: The transaction has been seen on the Stellar Horizon ledger but
   * has not yet reached the required confirmation depth to be treated as final.
   * An anchor in this state should NOT be surfaced to users as confirmed —
   * the underlying ledger entry could still disappear due to a chain reorg or
   * node inconsistency.  The reconciliation worker must re-verify these records
   * until they graduate to ANCHORED or regress to FAILED/EXPIRED.
   */
  OBSERVED = 'observed',
  ANCHORED = 'anchored',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

@Entity('stellar_anchors')
export class StellarAnchor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'confession_id', type: 'uuid' })
  @Index()
  confessionId: string;

  @Column({
    type: 'enum',
    enum: AnchorStatus,
    default: AnchorStatus.PENDING,
  })
  @Index()
  status: AnchorStatus;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'last_retry_at', type: 'timestamp', nullable: true })
  lastRetryAt: Date;

  @Column({ name: 'stellar_tx_hash', type: 'varchar', nullable: true })
  stellarTxHash: string;

  /**
   * Set when the tx is first observed on Horizon but not yet at required
   * confirmation depth. Cleared (set to null) when status moves to ANCHORED.
   */
  @Column({ name: 'observed_at', type: 'timestamp', nullable: true })
  observedAt: Date | null;

  /**
   * Stores the last error message for diagnostic visibility. Populated on
   * FAILED transitions so operators can understand why an anchor failed.
   */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Whether this anchor can be retried (failed or expired state).
   */
  get allowRetry(): boolean {
    return this.status === AnchorStatus.FAILED || this.status === AnchorStatus.EXPIRED;
  }
}
