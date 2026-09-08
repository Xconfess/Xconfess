import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryToConfessionDrafts20260626000001
  implements MigrationInterface
{
  name = 'AddCategoryToConfessionDrafts20260626000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('confession_drafts'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "confession_drafts" ADD COLUMN IF NOT EXISTS "category" varchar(80)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('confession_drafts'))) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "confession_drafts" DROP COLUMN IF EXISTS "category"`,
    );
  }
}
