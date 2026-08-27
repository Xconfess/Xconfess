import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequestIdToAuditLogs20260423000002 implements MigrationInterface {
  name = 'AddRequestIdToAuditLogs20260423000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        ADD COLUMN IF NOT EXISTS "request_id" VARCHAR(64) NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_request_id"
        ON "audit_logs" ("request_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_audit_logs_request_id";
    `);
    await queryRunner.query(`
      ALTER TABLE "audit_logs"
        DROP COLUMN IF EXISTS "request_id";
    `);
  }
}
