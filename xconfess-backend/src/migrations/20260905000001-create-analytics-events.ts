import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnalyticsEvents20260905000001
  implements MigrationInterface
{
  name = 'CreateAnalyticsEvents20260905000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_name" varchar(64) NOT NULL,
        "actor_id" varchar(128),
        "occurred_at" timestamptz NOT NULL,
        "network" varchar(16),
        "asset_code" varchar(16),
        "tx_hash" varchar(64),
        "contract_id" varchar(128),
        "amount_atomic" varchar(80),
        "schema_version" integer NOT NULL DEFAULT 1,
        "idempotency_key" varchar(160),
        "metadata_json" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_analytics_events_idempotency_key"
        ON "analytics_events" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_analytics_events_name_occurred"
        ON "analytics_events" ("event_name", "occurred_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_analytics_events_actor_occurred"
        ON "analytics_events" ("actor_id", "occurred_at")
        WHERE "actor_id" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_analytics_events_tx_event"
        ON "analytics_events" ("event_name", "tx_hash")
        WHERE "tx_hash" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_daily_rollups" (
        "date" date PRIMARY KEY,
        "registered_users" integer NOT NULL DEFAULT 0,
        "dau" integer NOT NULL DEFAULT 0,
        "confessions_created" integer NOT NULL DEFAULT 0,
        "comments_created" integer NOT NULL DEFAULT 0,
        "reactions_created" integer NOT NULL DEFAULT 0,
        "messages_sent" integer NOT NULL DEFAULT 0,
        "wallets_connected" integer NOT NULL DEFAULT 0,
        "stellar_tx_submitted" integer NOT NULL DEFAULT 0,
        "stellar_tx_confirmed" integer NOT NULL DEFAULT 0,
        "stellar_tx_failed" integer NOT NULL DEFAULT 0,
        "tips_completed" integer NOT NULL DEFAULT 0,
        "tip_volume_xlm" numeric(30,7) NOT NULL DEFAULT 0,
        "tip_volume_usdc" numeric(30,7) NOT NULL DEFAULT 0,
        "soroban_events_indexed" integer NOT NULL DEFAULT 0
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "analytics_daily_rollups";');
    await queryRunner.query('DROP TABLE IF EXISTS "analytics_events";');
  }
}
