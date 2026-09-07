import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeyToReports20260425000001 implements MigrationInterface {
  name = 'AddIdempotencyKeyToReports20260425000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasLegacyReportTable = await queryRunner.hasTable('report');
    const hasReportsTable = await queryRunner.hasTable('reports');
    const tableName = hasLegacyReportTable ? 'report' : hasReportsTable ? 'reports' : null;
    const reporterColumn = hasLegacyReportTable ? 'reporterId' : 'reporter_id';

    if (!tableName) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "${tableName}"
        ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS "idempotency_response" JSONB NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_reports_idempotency_key_reporter"
        ON "${tableName}" ("idempotency_key", "${reporterColumn}")
        WHERE "idempotency_key" IS NOT NULL
          AND "${reporterColumn}" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasLegacyReportTable = await queryRunner.hasTable('report');
    const hasReportsTable = await queryRunner.hasTable('reports');
    const tableName = hasLegacyReportTable ? 'report' : hasReportsTable ? 'reports' : null;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_reports_idempotency_key_reporter"`,
    );
    if (!tableName) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "${tableName}"
        DROP COLUMN IF EXISTS "idempotency_key",
        DROP COLUMN IF EXISTS "idempotency_response";
    `);
  }
}
