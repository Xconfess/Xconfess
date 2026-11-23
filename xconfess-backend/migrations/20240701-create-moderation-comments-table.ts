import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateModerationCommentsTable2024070100000 implements MigrationInterface {
    name = 'CreateModerationCommentsTable2024070100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "moderation_comments" (
            "id" SERIAL PRIMARY KEY,
            "commentId" integer NOT NULL,
            "status" varchar(16) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
            "moderatedAt" TIMESTAMP,
            "moderatedBy" integer,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now()
        )`);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'comments'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_comment'
                ) THEN
                    ALTER TABLE "moderation_comments"
                    ADD CONSTRAINT "FK_comment" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'user'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_moderator'
                ) THEN
                    ALTER TABLE "moderation_comments"
                    ADD CONSTRAINT "FK_moderator" FOREIGN KEY ("moderatedBy") REFERENCES "user"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "moderation_comments"`);
    }
} 
