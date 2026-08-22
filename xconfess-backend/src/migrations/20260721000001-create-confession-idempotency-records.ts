import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: create confession_idempotency_records table
 *
 * This table stores the canonical state of each idempotency-keyed confession
 * creation attempt so that:
 *
 * 1. Repeated requests with the same key + identical payload return the
 *    original response without creating a duplicate confession.
 * 2. Requests with the same key but a different payload receive a 409 conflict.
 * 3. Concurrent requests are serialised via a PostgreSQL advisory lock
 *    (taken in the service layer) backed by the unique constraint here.
 *
 * Columns:
 *   idempotency_key   - client-supplied key (UUID or opaque string, max 255)
 *   payload_hash      - SHA-256 of the canonicalised request payload
 *   status            - 'processing' | 'completed' | 'failed'
 *   response_status   - HTTP status code of the canonical response
 *   response_body     - JSON-serialised canonical response body
 *   confession_id     - FK to the created confession (nullable until committed)
 *   created_at        - row creation timestamp
 *   updated_at        - row last-updated timestamp
 *   expires_at        - soft-TTL for cleanup jobs (default 24 h from creation)
 */
export class CreateConfessionIdempotencyRecords20260721000001
  implements MigrationInterface
{
  name = 'CreateConfessionIdempotencyRecords20260721000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "confession_idempotency_records" (
        "id"               UUID              NOT NULL DEFAULT gen_random_uuid(),
        "idempotency_key"  VARCHAR(255)      NOT NULL,
        "payload_hash"     VARCHAR(64)       NOT NULL,
        "status"           VARCHAR(16)       NOT NULL DEFAULT 'processing',
        "response_status"  INTEGER           NULL,
        "response_body"    JSONB             NULL,
        "confession_id"    UUID              NULL
          REFERENCES "anonymous_confessions"("id") ON DELETE SET NULL,
        "created_at"       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        "expires_at"       TIMESTAMPTZ       NOT NULL
          DEFAULT (NOW() + INTERVAL '24 hours'),
        CONSTRAINT "pk_confession_idempotency_records" PRIMARY KEY ("id"),
        CONSTRAINT "uq_confession_idempotency_key"     UNIQUE ("idempotency_key")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cir_expires_at"
        ON "confession_idempotency_records" ("expires_at");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cir_confession_id"
        ON "confession_idempotency_records" ("confession_id")
        WHERE "confession_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_cir_confession_id";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_cir_expires_at";
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "confession_idempotency_records";
    `);
  }
}
