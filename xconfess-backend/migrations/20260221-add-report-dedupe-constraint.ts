import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforce report deduplication at DB level.
 * Prevents concurrent duplicate reports from the same user for the same confession.
 * Partial unique index: applies only when reporter_id IS NOT NULL (logged-in users).
 * Anonymous reports (reporter_id IS NULL) continue to use app-level dedupe.
 */
export class AddReportDedupeConstraint2026022100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_dedupe_confession_reporter
      ON reports(confession_id, reporter_id)
      WHERE reporter_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_reports_dedupe_confession_reporter;
    `);
  }
}
