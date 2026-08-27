import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateReportDedupeConstraint1774790308946 implements MigrationInterface {
    name = 'UpdateReportDedupeConstraint1774790308946'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop the old index
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_reports_dedupe_confession_reporter;
        `);
        // Create new indexes for authenticated and anonymous reporters
        await queryRunner.query(`
            CREATE UNIQUE INDEX idx_reports_dedupe_authenticated
            ON reports(confession_id, reporter_id)
            WHERE reporter_id IS NOT NULL;
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX idx_reports_dedupe_anonymous
            ON reports(confession_id, anonymous_reporter_id)
            WHERE anonymous_reporter_id IS NOT NULL;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop the new indexes
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_reports_dedupe_anonymous;
        `);
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_reports_dedupe_authenticated;
        `);
        // Recreate the old index
        await queryRunner.query(`
            CREATE UNIQUE INDEX idx_reports_dedupe_confession_reporter
            ON reports(confession_id, reporter_id)
            WHERE reporter_id IS NOT NULL;
        `);
    }

}
