import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageE2eKeys2025062800000 implements MigrationInterface {
  name = 'AddMessageE2eKeys2025062800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "anonymous_user"
      ADD COLUMN IF NOT EXISTS "messagePublicKey" varchar(128),
      ADD COLUMN IF NOT EXISTS "messageKeyVersion" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "encryptedKeyBackup" text
    `);

    await queryRunner.query(`
      ALTER TABLE "messages"
      ADD COLUMN IF NOT EXISTS "isEncrypted" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "messages"
      DROP COLUMN IF EXISTS "isEncrypted"
    `);

    await queryRunner.query(`
      ALTER TABLE "anonymous_user"
      DROP COLUMN IF EXISTS "encryptedKeyBackup",
      DROP COLUMN IF EXISTS "messageKeyVersion",
      DROP COLUMN IF EXISTS "messagePublicKey"
    `);
  }
}
