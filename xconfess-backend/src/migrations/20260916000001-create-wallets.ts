import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWallets20260916000001 implements MigrationInterface {
  name = 'CreateWallets20260916000001';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "wallet_network_enum" AS ENUM('TESTNET','MAINNET')`);
    await queryRunner.query(`CREATE TYPE "wallet_status_enum" AS ENUM('ACTIVE','LOCKED','DISABLED')`);
    await queryRunner.query(`CREATE TABLE "wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" integer NOT NULL, "publicKey" varchar(56) NOT NULL, "network" "wallet_network_enum" NOT NULL DEFAULT 'TESTNET', "walletType" varchar(32) NOT NULL DEFAULT 'XCONFESS_EMBEDDED', "status" "wallet_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "lastSyncedAt" TIMESTAMP, CONSTRAINT "PK_wallets_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_wallets_user" ON "wallets" ("userId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_wallets_public_key" ON "wallets" ("publicKey")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query(`DROP TABLE "wallets"`); await queryRunner.query(`DROP TYPE "wallet_status_enum"`); await queryRunner.query(`DROP TYPE "wallet_network_enum"`); }
}
