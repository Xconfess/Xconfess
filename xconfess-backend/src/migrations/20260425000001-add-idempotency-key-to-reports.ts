import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeyToReports20260425000001 implements MigrationInterface {
  name = 'AddIdempotencyKeyToReports20260425000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add idempotency_key column (nullable — older rows won't have one)
    await queryRunner.query(`
      ALTER TABLE "report"
        ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS "idempotency_response" JSONB NULL;
    `);

    // Unique index: key is scoped per user (NULL reporter treated as anonymous
    // and NOT deduplicated by key — anonymous requests are already rate-limited).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_reports_idempotency_key_reporter"
        ON "report" ("idempotency_key", "reporterId")
        WHERE "idempotency_key" IS NOT NULL
          AND "reporterId" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_reports_idempotency_key_reporter"`,
    );
    await queryRunner.query(`
      ALTER TABLE "report"
        DROP COLUMN IF EXISTS "idempotency_key",
        DROP COLUMN IF EXISTS "idempotency_response";
    `);
  }
}
