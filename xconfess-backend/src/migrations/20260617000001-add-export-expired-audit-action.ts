import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExportExpiredAuditAction20260617000001
  implements MigrationInterface
{
  name = 'AddExportExpiredAuditAction20260617000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "public"."audit_logs_action_enum"
          ADD VALUE IF NOT EXISTS 'export_expired';
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot safely remove enum values in a reversible migration.
  }
}
