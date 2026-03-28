// src/data-export/entities/export-request.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('export_requests')
export class ExportRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ default: 'PENDING' })
  status!: string;

  // Storing the actual ZIP file in the DB (fallback for small exports)
  @Column({ type: 'bytea', nullable: true, select: false })
  fileData!: Buffer | null;

  @Column({ default: false })
  isChunked!: boolean;

  @Column({ default: 0 })
  chunkCount!: number;

  @Column({ type: 'bigint', default: 0 })
  totalSize!: string; // Stored as string to handle bigint safely in JS

  @Column({ nullable: true })
  combinedChecksum!: string; // SHA-256 of the concatenated chunks

  @CreateDateColumn()
  createdAt!: Date;

  // ── Lifecycle timestamps ──────────────────────────────────────────────────

  /** Set when the export job is enqueued in Bull. */
  @Column({ type: 'timestamp', nullable: true })
  queuedAt!: Date | null;

  /** Set when the processor picks up the job. */
  @Column({ type: 'timestamp', nullable: true })
  processingAt!: Date | null;

  /** Set when the export reaches READY status. */
  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  /** Updated every time the processor fails (supports retries). */
  @Column({ type: 'timestamp', nullable: true })
  failedAt!: Date | null;

  /** Set when the 24-hour download window elapses. */
  @Column({ type: 'timestamp', nullable: true })
  expiredAt!: Date | null;

  // ── Retry / failure metadata ──────────────────────────────────────────────

  /** Number of times the processor has attempted (and failed) this job. */
  @Column({ default: 0 })
  retryCount!: number;

  /** The error message from the most recent processor failure. */
  @Column({ type: 'text', nullable: true })
  lastFailureReason!: string | null;
}
