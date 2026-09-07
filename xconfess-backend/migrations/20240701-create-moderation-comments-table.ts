import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateModerationCommentsTable2024070100000 implements MigrationInterface {
    name = 'CreateModerationCommentsTable2024070100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "moderation_comments" (
            "id" SERIAL PRIMARY KEY,
            "commentId" integer NOT NULL,
            "status" varchar(16) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
            "moderatedAt" TIMESTAMP,
            "moderatedBy" integer,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "FK_comment" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_moderator" FOREIGN KEY ("moderatedBy") REFERENCES "user"("id") ON DELETE SET NULL
        )`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "moderation_comments"`);
    }
} 
