import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AnonymousConfession } from './confession.entity';

export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

/**
 * Persists idempotency state for confession creation requests.
 *
 * Lifecycle:
 *   1. Row inserted with status='processing' before confession creation begins.
 *   2. After successful creation: status='completed', confession_id + response_body saved.
 *   3. On failure: status='failed'.
 *
 * Concurrent requests for the same idempotency_key hit the UNIQUE constraint
 * and are handled via a PostgreSQL advisory lock in IdempotencyService.
 */
@Entity('confession_idempotency_records')
export class ConfessionIdempotencyRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Client-supplied idempotency key (UUID or opaque string). */
  @Index({ unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey: string;

  /**
   * SHA-256 of the canonicalised request payload.
   * Used to detect payload-mismatch replays (returns 409).
   */
  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  /**
   * Processing state:
   *   'processing' – request is in-flight (or crashed before completing)
   *   'completed'  – confession was created; response_body holds the canonical reply
   *   'failed'     – creation failed; response_body holds the error
   */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: 'processing',
  })
  status: IdempotencyStatus;

  /** HTTP status code stored with the canonical response. */
  @Column({ name: 'response_status', type: 'int', nullable: true })
  responseStatus: number | null;

  /** Full serialised response body for deterministic replay. */
  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: object | null;

  /** FK to the confession that was created (null until committed). */
  @Column({ name: 'confession_id', type: 'uuid', nullable: true })
  confessionId: string | null;

  @ManyToOne(() => AnonymousConfession, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'confession_id' })
  confession: AnonymousConfession | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Soft-TTL for background cleanup.
   * Defaults to 24 h after creation (set in migration).
   */
  @Column({
    name: 'expires_at',
    type: 'timestamptz',
    default: () => "NOW() + INTERVAL '24 hours'",
  })
  expiresAt: Date;
}
