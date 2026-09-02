import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1453 — extend the `audit_logs_action_enum` with a new value for
 * archive-integrity-verification failures so they show up in the export
 * lifecycle trail alongside `generation_completed` and friends.
 *
 * Mirrors `20260324000100-add-export-audit-action-types.ts`.
 */
export class AddExportIntegrityVerificationAuditAction20260722000002
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
          ALTER TYPE "audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'export_integrity_verification_failed';
        END IF;
      END
      $$;
    `);
  }

  public async down(): Promise<void> {
    // Postgres enum values are not removed safely in a reversible way.
  }
}
