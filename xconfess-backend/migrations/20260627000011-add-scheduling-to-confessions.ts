import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchedulingToConfessions20260627000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('anonymous_confessions'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "anonymous_confessions"
        ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'published',
        ADD COLUMN IF NOT EXISTS "publish_at" timestamp NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('anonymous_confessions'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "anonymous_confessions"
        DROP COLUMN IF EXISTS "publish_at",
        DROP COLUMN IF EXISTS "status";
    `);
  }
}
