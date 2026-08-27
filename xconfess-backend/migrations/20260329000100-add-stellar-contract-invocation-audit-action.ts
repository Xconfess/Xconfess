import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStellarContractInvocationAuditAction20260329000100
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          WHERE t.typname = 'audit_logs_action_enum'
        ) THEN
          ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'stellar_contract_invocation';
        END IF;
      END
      $$;
    `);
  }

  public async down(): Promise<void> {
    // Postgres enum values are not removed safely in a reversible way.
  }
}
