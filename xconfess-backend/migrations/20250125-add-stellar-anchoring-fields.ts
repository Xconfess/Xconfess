import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStellarAnchoringFields2025012500000 implements MigrationInterface {
    name = 'AddStellarAnchoringFields2025012500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('anonymous_confessions'))) {
            return;
        }

        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN IF NOT EXISTS "stellar_tx_hash" varchar(128)`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN IF NOT EXISTS "stellar_hash" varchar(64)`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN IF NOT EXISTS "is_anchored" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN IF NOT EXISTS "anchored_at" TIMESTAMP`);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_confession_stellar_tx_hash" ON "anonymous_confessions" ("stellar_tx_hash")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_confession_is_anchored" ON "anonymous_confessions" ("is_anchored")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('anonymous_confessions'))) {
            return;
        }

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_confession_is_anchored"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_confession_stellar_tx_hash"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN IF EXISTS "anchored_at"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN IF EXISTS "is_anchored"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN IF EXISTS "stellar_hash"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN IF EXISTS "stellar_tx_hash"`);
    }
}
