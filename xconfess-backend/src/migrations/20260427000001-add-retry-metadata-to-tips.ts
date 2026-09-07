import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetryMetadataToTips20260427000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tips'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "tips"
        ADD COLUMN IF NOT EXISTS "retry_count" int DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "last_chain_status" varchar(50) NULL,
        ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp NULL,
        ADD COLUMN IF NOT EXISTS "reconciliation_metadata" jsonb NULL;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "tips"."retry_count"
        IS 'Number of verification/reconciliation retry attempts';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "tips"."last_chain_status"
        IS 'Last observed chain status during verification';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "tips"."last_checked_at"
        IS 'Timestamp of last chain status check';
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "tips"."reconciliation_metadata"
        IS 'Additional reconciliation and debugging metadata';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tips'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "tips"
        DROP COLUMN IF EXISTS "reconciliation_metadata",
        DROP COLUMN IF EXISTS "last_checked_at",
        DROP COLUMN IF EXISTS "last_chain_status",
        DROP COLUMN IF EXISTS "retry_count";
    `);
  }
}
