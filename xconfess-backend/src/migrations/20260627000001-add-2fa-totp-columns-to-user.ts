import { MigrationInterface, QueryRunner } from 'typeorm';

export class Add2faTotpColumnsToUser20260627000001 implements MigrationInterface {
  name = 'Add2faTotpColumnsToUser20260627000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS "is_2fa_enabled" BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS "totp_secret" VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS "pending_totp_secret" VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS "totp_recovery_codes" TEXT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user"
        DROP COLUMN IF EXISTS "is_2fa_enabled",
        DROP COLUMN IF EXISTS "totp_secret",
        DROP COLUMN IF EXISTS "pending_totp_secret",
        DROP COLUMN IF EXISTS "totp_recovery_codes";
    `);
  }
}
