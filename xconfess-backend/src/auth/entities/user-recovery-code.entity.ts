import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A single two-factor recovery code, stored only as a salted scrypt hash.
 *
 * - Single use: `used_at` is set atomically when the code is redeemed.
 * - Rotation: generating a new batch sets `revoked_at` on every active code
 *   of the previous batch.
 * The plaintext code is shown to the user once and never persisted.
 */
@Entity('user_recovery_codes')
@Index('idx_user_recovery_codes_user_id', ['userId'])
export class UserRecoveryCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  /** Codes generated together share a batch; regeneration revokes the batch. */
  @Column({ name: 'batch_id', type: 'uuid' })
  batchId: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 255 })
  codeHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
