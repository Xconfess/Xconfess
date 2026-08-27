import { MigrationInterface, QueryRunner } from "typeorm";

export class AddViewCountToConfessions20260226000002 implements MigrationInterface {
    public name = 'AddViewCountToConfessions20260226000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN "view_count"`);
    }
}
