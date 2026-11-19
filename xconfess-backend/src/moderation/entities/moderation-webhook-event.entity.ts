import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One row per moderation webhook event that was applied.
 *
 * The primary key on `event_id` is what makes delivery idempotent: the row is
 * inserted with `ON CONFLICT DO NOTHING` in the same transaction that applies
 * the moderation result, so an event can be applied at most once even when
 * several instances receive the same delivery concurrently. A failed delivery
 * rolls the row back, so the provider's retry is processed normally.
 */
@Entity('moderation_webhook_events')
@Index('idx_moderation_webhook_events_processed_at', ['processedAt'])
export class ModerationWebhookEvent {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 128 })
  eventId: string;

  /** SHA-256 of the signed payload; detects an event ID reused for other content. */
  @Column({ name: 'payload_hash', type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ name: 'confession_id', type: 'varchar', length: 64, nullable: true })
  confessionId: string | null;

  /** Timestamp from the signature header (seconds precision). */
  @Column({ name: 'signed_at', type: 'timestamptz' })
  signedAt: Date;

  @CreateDateColumn({ name: 'processed_at', type: 'timestamptz' })
  processedAt: Date;
}
