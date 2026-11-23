import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProcessingLockToTips20260427000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tips'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "tips"
        ADD COLUMN IF NOT EXISTS "processing_lock" varchar(64) NULL,
        ADD COLUMN IF NOT EXISTS "locked_at" timestamp NULL,
        ADD COLUMN IF NOT EXISTS "locked_by" varchar(100) NULL;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "tips"."processing_lock"
        IS 'Lock identifier to prevent concurrent processing';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "tips"."locked_at"
        IS 'Timestamp when processing lock was acquired';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "tips"."locked_by"
        IS 'Process identifier that acquired the lock (verify/reconciliation)';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tips_processing_lock"
      ON "tips" ("processing_lock")
      WHERE "processing_lock" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tips'))) {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tips_processing_lock"`);
    await queryRunner.query(`
      ALTER TABLE "tips"
        DROP COLUMN IF EXISTS "locked_by",
        DROP COLUMN IF EXISTS "locked_at",
        DROP COLUMN IF EXISTS "processing_lock";
    `);
  }
}
