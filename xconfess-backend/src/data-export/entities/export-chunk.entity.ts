// src/data-export/entities/export-chunk.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ExportRequest } from './export-request.entity';

/**
 * Lifecycle of an individual chunk during a resumable export.
 *
 *  - PENDING:   not yet persisted (placeholder row during error handling)
 *  - COMPLETED: data is durably stored in `fileData` and verifiable
 *  - FAILED:    write attempt failed; safe error metadata recorded
 */
export type ExportChunkStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

/**
 * Safe, non-sensitive metadata recorded when a chunk write fails.
 * Never contains PII, stack traces, paths, or secrets.
 */
export interface ExportChunkErrorMetadata {
  /** ISO-8601 timestamp of the failure. */
  at: string;
  /** Stable string code describing the failure category (e.g. CHUNK_WRITE_TIMEOUT). */
  code: string;
  /** Short, scrubbed message suitable for operators. */
  message: string;
  /** Hint to the retry / queue layer whether this is safe to retry. */
  isRetryable: boolean;
}

@Entity('export_chunks')
@Unique('uq_export_chunks_request_index', ['exportRequestId', 'chunkIndex'])
export class ExportChunk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ExportRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'export_request_id' })
  @Index()
  exportRequest!: ExportRequest;

  @Column({ name: 'export_request_id' })
  exportRequestId!: string;

  @Column()
  chunkIndex!: number;

  @Column({ type: 'bytea' })
  fileData!: Buffer;

  @Column()
  chunkSize!: number;

  @Column()
  checksum!: string; // SHA-256 of this chunk

  /**
   * Per-chunk processing status. Defaults to 'COMPLETED' so legacy rows
   * (written before this column existed) remain queryable as completed.
   */
  @Column({ type: 'varchar', length: 16, default: 'COMPLETED' })
  status!: ExportChunkStatus;

  /**
   * Only populated when status === 'FAILED'. Holds a sanitized JSON object
   * of the form ExportChunkErrorMetadata. May be null for completed chunks.
   */
  @Column({ type: 'jsonb', nullable: true })
  errorMetadata!: ExportChunkErrorMetadata | null;
}
