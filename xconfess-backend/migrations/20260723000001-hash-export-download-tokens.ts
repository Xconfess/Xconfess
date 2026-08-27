import { MigrationInterface, QueryRunner } from 'typeorm';

export class HashExportDownloadTokens20260723000002
  implements MigrationInterface
{
  name = 'HashExportDownloadTokens20260723000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          WHERE t.typname = 'audit_logs_action_enum'
        ) THEN
          ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'export_download_failed';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "export_requests"
        ADD COLUMN IF NOT EXISTS "downloadTokenHash" VARCHAR(64) NULL;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'export_requests'
            AND column_name = 'downloadToken'
        ) THEN
          UPDATE "export_requests"
          SET "downloadTokenHash" = NULL,
              "downloadToken" = NULL
          WHERE "downloadToken" IS NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "export_requests"
        DROP COLUMN IF EXISTS "downloadToken";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "export_requests"
        ADD COLUMN IF NOT EXISTS "downloadToken" VARCHAR(255) NULL,
        DROP COLUMN IF EXISTS "downloadTokenHash";
    `);
  }
}
