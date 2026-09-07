import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeyToTips20260527000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tips'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "tips"
        ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128) NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tips_idempotency_key"
      ON "tips" ("idempotency_key");
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tips_confession_txid_unique"
      ON "tips" ("confession_id", "tx_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tips'))) {
      return;
    }

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_tips_confession_txid_unique"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tips_idempotency_key"`);
    await queryRunner.query(`
      ALTER TABLE "tips"
        DROP COLUMN IF EXISTS "idempotency_key";
    `);
  }
}
