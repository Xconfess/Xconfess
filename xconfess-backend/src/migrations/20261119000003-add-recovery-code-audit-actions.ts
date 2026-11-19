import { MigrationInterface, QueryRunner } from 'typeorm';

const ACTIONS = [
  'two_factor_recovery_codes_generated',
  'two_factor_recovery_code_used',
  'two_factor_recovery_code_failed',
  'two_factor_recovery_codes_revoked',
];

export class AddRecoveryCodeAuditActions20261119000003
  implements MigrationInterface
{
  name = 'AddRecoveryCodeAuditActions20261119000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const action of ACTIONS) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_type t WHERE t.typname = 'audit_logs_action_enum'
          ) THEN
            ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS '${action}';
          END IF;
        END
        $$;
      `);
    }
  }

  public async down(): Promise<void> {
    // Postgres enum values are not removed safely in a reversible way.
  }
}
