import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMessagesTable2025062700000 implements MigrationInterface {
    name = 'CreateMessagesTable2025062700000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "messages" (
            "id" SERIAL PRIMARY KEY,
            "senderId" integer NOT NULL,
            "confessionId" integer NOT NULL,
            "content" text NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "hasReply" boolean NOT NULL DEFAULT false,
            "replyContent" text,
            "repliedAt" TIMESTAMP
        )`);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'user'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_sender'
                ) THEN
                    ALTER TABLE "messages"
                    ADD CONSTRAINT "FK_sender" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'confession'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_confession'
                ) THEN
                    ALTER TABLE "messages"
                    ADD CONSTRAINT "FK_confession" FOREIGN KEY ("confessionId") REFERENCES "confession"("id") ON DELETE CASCADE;
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    }
}
