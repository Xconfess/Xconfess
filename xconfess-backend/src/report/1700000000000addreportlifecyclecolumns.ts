import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReportLifecycleColumns1771601903901 implements MigrationInterface {
  name = 'AddReportLifecycleColumns1771601903901';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type safely (no-op if it already exists)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."reports_status_enum" AS ENUM ('pending', 'resolved', 'dismissed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // status — defaults to 'pending' for all new and existing rows
    await queryRunner.query(`
      ALTER TABLE "reports"
        ADD COLUMN IF NOT EXISTS "status" "public"."reports_status_enum"
        NOT NULL DEFAULT 'pending'
    `);

    // resolved_by — FK to users.id, nulled out if the user is deleted
    await queryRunner.query(`
      ALTER TABLE "reports"
        ADD COLUMN IF NOT EXISTS "resolved_by" integer DEFAULT NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "reports"
          ADD CONSTRAINT "FK_reports_resolved_by"
          FOREIGN KEY ("resolved_by") REFERENCES "users"("id")
          ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // resolved_at
    await queryRunner.query(`
      ALTER TABLE "reports"
        ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP DEFAULT NULL
    `);

    // resolution_reason
    await queryRunner.query(`
      ALTER TABLE "reports"
        ADD COLUMN IF NOT EXISTS "resolution_reason" character varying DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reports"
        DROP CONSTRAINT IF EXISTS "FK_reports_resolved_by"
    `);

    await queryRunner.query(
      `ALTER TABLE "reports" DROP COLUMN IF EXISTS "resolution_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" DROP COLUMN IF EXISTS "resolved_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" DROP COLUMN IF EXISTS "resolved_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" DROP COLUMN IF EXISTS "status"`,
    );

    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."reports_status_enum"`,
    );
  }
}
