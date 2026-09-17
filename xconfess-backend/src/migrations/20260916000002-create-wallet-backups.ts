import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletBackups20260916000002 implements MigrationInterface {
  name = 'CreateWalletBackups20260916000002';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "wallet_backups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "walletId" uuid NOT NULL, "encryptedPayload" text NOT NULL, "encryptionVersion" integer NOT NULL DEFAULT 1, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_wallet_backups_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_wallet_backups_wallet" ON "wallet_backups" ("walletId")`);
    await queryRunner.query(`ALTER TABLE "wallet_backups" ADD CONSTRAINT "FK_wallet_backups_wallet" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query(`ALTER TABLE "wallet_backups" DROP CONSTRAINT "FK_wallet_backups_wallet"`); await queryRunner.query(`DROP TABLE "wallet_backups"`); }
}
