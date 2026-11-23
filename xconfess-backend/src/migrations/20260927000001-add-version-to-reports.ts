import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVersionToReports20260927000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "version" INT NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "reports"."version"
      IS 'Optimistic locking version for conflict detection';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_reports_version"
      ON "reports" ("id", "version");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reports_version"`
    );
    await queryRunner.query(`
      ALTER TABLE "reports"
      DROP COLUMN IF EXISTS "version"
    `);
  }
}
