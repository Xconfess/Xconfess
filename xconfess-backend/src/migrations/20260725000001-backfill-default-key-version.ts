import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillDefaultKeyVersion20260725000001
  implements MigrationInterface
{
  name = 'BackfillDefaultKeyVersion20260725000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "anonymous_confessions" SET "key_version" = 'v1' WHERE "key_version" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverting backfill is a no-op to preserve data integrity
  }
}
