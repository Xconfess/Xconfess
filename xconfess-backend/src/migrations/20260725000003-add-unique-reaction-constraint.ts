import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueReactionConstraint20260725000003
  implements MigrationInterface
{
  name = 'AddUniqueReactionConstraint20260725000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_reaction_confession_user"
        ON "reaction" ("confession_id", "anonymous_user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_reaction_confession_user";
    `);
  }
}
