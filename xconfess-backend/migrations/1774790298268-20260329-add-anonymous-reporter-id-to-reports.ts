import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnonymousReporterIdToReports1774790298268 implements MigrationInterface {
    name = 'AddAnonymousReporterIdToReports1774790298268'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "reports"
            ADD COLUMN "anonymous_reporter_id" uuid;
        `);
        await queryRunner.query(`
            ALTER TABLE "reports"
            ADD CONSTRAINT "FK_reports_anonymous_reporter_id"
            FOREIGN KEY ("anonymous_reporter_id") REFERENCES "anonymous_user"("id") ON DELETE SET NULL;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "reports"
            DROP CONSTRAINT "FK_reports_anonymous_reporter_id";
        `);
        await queryRunner.query(`
            ALTER TABLE "reports" DROP COLUMN "anonymous_reporter_id";
        `);
    }

}
