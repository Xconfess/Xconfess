import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDownloadTokenToExportRequests20260422000000 implements MigrationInterface {
  name = 'AddDownloadTokenToExportRequests20260422000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "export_requests"
        ADD COLUMN IF NOT EXISTS "downloadTokenHash"  VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS "downloadedAt"   TIMESTAMP   NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "export_requests"
        DROP COLUMN IF EXISTS "downloadTokenHash",
        DROP COLUMN IF EXISTS "downloadedAt";
    `);
  }
}
