import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExportAuditActionTypes20260324000100 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          WHERE t.typname = 'audit_logs_action_enum'
        ) THEN
          ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'export_request_created';
          ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'export_generation_completed';
          ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'export_link_refreshed';
          ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'export_downloaded';
        END IF;
      END
      $$;
    `);
  }

  public async down(): Promise<void> {
    // Postgres enum values are not removed safely in a reversible way.
  }
}
