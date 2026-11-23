import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnonymousReporterIdToReports1774790298268 implements MigrationInterface {
    name = 'AddAnonymousReporterIdToReports1774790298268'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('reports'))) {
            return;
        }

        await queryRunner.query(`
            ALTER TABLE "reports"
            ADD COLUMN IF NOT EXISTS "anonymous_reporter_id" uuid;
        `);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'anonymous_user'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'FK_reports_anonymous_reporter_id'
                ) THEN
                    ALTER TABLE "reports"
                    ADD CONSTRAINT "FK_reports_anonymous_reporter_id"
                    FOREIGN KEY ("anonymous_reporter_id") REFERENCES "anonymous_user"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('reports'))) {
            return;
        }

        await queryRunner.query(`
            ALTER TABLE "reports"
            DROP CONSTRAINT IF EXISTS "FK_reports_anonymous_reporter_id";
        `);
        await queryRunner.query(`
            ALTER TABLE "reports" DROP COLUMN IF EXISTS "anonymous_reporter_id";
        `);
    }

}
