import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeyToConfessions20260423000001 implements MigrationInterface {
  name = 'AddIdempotencyKeyToConfessions20260423000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "anonymous_confessions"
        ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(64) NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_confessions_idempotency_key"
        ON "anonymous_confessions" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_confessions_idempotency_key";
    `);
    await queryRunner.query(`
      ALTER TABLE "anonymous_confessions"
        DROP COLUMN IF EXISTS "idempotency_key";
    `);
  }
}
