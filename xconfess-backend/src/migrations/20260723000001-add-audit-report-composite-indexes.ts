import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: add composite indexes for admin audit and report filters
 *
 * Adds indexes optimized for real query patterns observed in:
 *   - AuditLogService.findAll: filters by admin_id + action + entity_type, sorted by createdAt
 *   - AdminService.getReportsCursor: keyset pagination (createdAt DESC, id DESC) with status/type filters
 *
 * Indexes added:
 *   - audit_logs: (admin_id, created_at DESC)
 *   - audit_logs: (action, created_at DESC)
 *   - audit_logs: (entity_type, created_at DESC)
 *   - reports: (status, created_at DESC, id DESC)
 *   - reports: (type, created_at DESC, id DESC)
 */
export class AddAuditReportCompositeIndexes20260723000001
  implements MigrationInterface
{
  name = 'AddAuditReportCompositeIndexes20260723000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Audit logs composite indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_admin_created"
        ON "audit_logs" ("admin_id", "createdAt" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_action_created"
        ON "audit_logs" ("action", "createdAt" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity_type_created"
        ON "audit_logs" ("entity_type", "createdAt" DESC);
    `);

    // Reports composite indexes for cursor pagination and filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reports_status_created_id"
        ON "reports" ("status", "createdAt" DESC, "id" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reports_type_created_id"
        ON "reports" ("type", "createdAt" DESC, "id" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_reports_type_created_id";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_reports_status_created_id";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_audit_logs_entity_type_created";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_audit_logs_action_created";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_audit_logs_admin_created";
    `);
  }
}
