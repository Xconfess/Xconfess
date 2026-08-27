import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryToConfessionDrafts20260626000001
  implements MigrationInterface
{
  name = 'AddCategoryToConfessionDrafts20260626000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "confession_drafts" ADD COLUMN IF NOT EXISTS "category" varchar(80)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "confession_drafts" DROP COLUMN IF EXISTS "category"`,
    );
  }
}
