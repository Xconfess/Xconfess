import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStellarAnchoringFields2025012500000 implements MigrationInterface {
    name = 'AddStellarAnchoringFields2025012500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD "stellar_tx_hash" varchar(128)`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD "stellar_hash" varchar(64)`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD "is_anchored" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD "anchored_at" TIMESTAMP`);

        await queryRunner.query(`CREATE INDEX "IDX_confession_stellar_tx_hash" ON "anonymous_confessions" ("stellar_tx_hash")`);
        await queryRunner.query(`CREATE INDEX "IDX_confession_is_anchored" ON "anonymous_confessions" ("is_anchored")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_confession_is_anchored"`);
        await queryRunner.query(`DROP INDEX "IDX_confession_stellar_tx_hash"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN "anchored_at"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN "is_anchored"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN "stellar_hash"`);
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN "stellar_tx_hash"`);
    }
}
