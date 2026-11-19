import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, Repository } from 'typeorm';
import { ModerationWebhookEvent } from './entities/moderation-webhook-event.entity';

export interface WebhookEventRecord {
  eventId: string;
  payloadHash: string;
  confessionId: string | null;
  signedAt: Date;
}

/**
 * - `claimed`    this delivery owns the event; apply it.
 * - `duplicate`  the same event (same payload) was already applied.
 * - `conflict`   the event ID was already used for a different payload.
 */
export type WebhookEventClaim = 'claimed' | 'duplicate' | 'conflict';

/**
 * Durable, idempotent record of applied moderation webhook events.
 */
@Injectable()
export class ModerationWebhookEventStore {
  private readonly logger = new Logger(ModerationWebhookEventStore.name);

  constructor(
    @InjectRepository(ModerationWebhookEvent)
    private readonly repository: Repository<ModerationWebhookEvent>,
  ) {}

  /** Fast, lock-free lookup used before opening a transaction. */
  async find(
    eventId: string,
  ): Promise<Pick<ModerationWebhookEvent, 'eventId' | 'payloadHash'> | null> {
    return this.repository.findOne({
      where: { eventId },
      select: { eventId: true, payloadHash: true },
    });
  }

  /**
   * Insert the event inside the caller's transaction.
   *
   * `ON CONFLICT DO NOTHING` makes the insert idempotent: when two deliveries
   * race, the second insert waits for the first transaction and then inserts
   * nothing. Because the row only commits together with the moderation
   * update, a failed delivery leaves no row behind and can be retried.
   */
  async claim(
    manager: EntityManager,
    record: WebhookEventRecord,
  ): Promise<WebhookEventClaim> {
    const inserted: Array<{ event_id: string }> = await manager.query(
      `INSERT INTO "moderation_webhook_events"
         ("event_id", "payload_hash", "confession_id", "signed_at")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("event_id") DO NOTHING
       RETURNING "event_id"`,
      [record.eventId, record.payloadHash, record.confessionId, record.signedAt],
    );
    if (inserted.length > 0) return 'claimed';

    const existing: Array<{ payload_hash: string }> = await manager.query(
      `SELECT "payload_hash" FROM "moderation_webhook_events" WHERE "event_id" = $1`,
      [record.eventId],
    );
    return existing[0]?.payload_hash === record.payloadHash
      ? 'duplicate'
      : 'conflict';
  }

  /** Delete records older than the retention window. Returns rows removed. */
  async pruneOlderThan(cutoff: Date): Promise<number> {
    const result = await this.repository.delete({
      processedAt: LessThan(cutoff),
    });
    const removed = result.affected ?? 0;
    if (removed > 0) {
      this.logger.log(`Pruned ${removed} expired moderation webhook event(s)`);
    }
    return removed;
  }
}
