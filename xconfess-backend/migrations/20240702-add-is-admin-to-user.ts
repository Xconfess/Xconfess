import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsAdminToUser2024070200000 implements MigrationInterface {
    name = 'AddIsAdminToUser2024070200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN "isAdmin" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isAdmin"`);
    }
} 
