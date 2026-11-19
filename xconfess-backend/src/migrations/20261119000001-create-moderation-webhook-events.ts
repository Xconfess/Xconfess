import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Durable store of processed moderation webhook event IDs (replay protection).
 */
export class CreateModerationWebhookEvents20261119000001
  implements MigrationInterface
{
  name = 'CreateModerationWebhookEvents20261119000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moderation_webhook_events" (
        "event_id" varchar(128) PRIMARY KEY,
        "payload_hash" varchar(64) NOT NULL,
        "confession_id" varchar(64),
        "signed_at" timestamptz NOT NULL,
        "processed_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moderation_webhook_events_processed_at"
        ON "moderation_webhook_events" ("processed_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "moderation_webhook_events";',
    );
  }
}
