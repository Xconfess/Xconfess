import { MigrationInterface, QueryRunner } from "typeorm";

export class AddViewCountToConfessions20260226000002 implements MigrationInterface {
    public name = 'AddViewCountToConfessions20260226000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('anonymous_confessions'))) {
            return;
        }

        await queryRunner.query(`ALTER TABLE "anonymous_confessions" ADD COLUMN IF NOT EXISTS "view_count" INTEGER NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "anonymous_confessions" DROP COLUMN IF EXISTS "view_count"`);
    }
}
