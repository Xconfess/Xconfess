import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTotpToUser2026062700000 implements MigrationInterface {
  name = 'AddTotpToUser2026062700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "totp_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "totp_secret_encrypted" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "totp_secret_iv" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "totp_secret_tag" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "recovery_codes_encrypted" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "recovery_codes_iv" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "recovery_codes_tag" varchar(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "recovery_codes_encrypted"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "recovery_codes_tag"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "recovery_codes_iv"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "totp_secret_tag"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "totp_secret_iv"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "totp_secret_encrypted"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "totp_enabled"`);
  }
}
