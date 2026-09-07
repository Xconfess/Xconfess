import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMessagesTable2025062700000 implements MigrationInterface {
    name = 'CreateMessagesTable2025062700000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "messages" (
            "id" SERIAL PRIMARY KEY,
            "senderId" integer NOT NULL,
            "confessionId" integer NOT NULL,
            "content" text NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "hasReply" boolean NOT NULL DEFAULT false,
            "replyContent" text,
            "repliedAt" TIMESTAMP,
            CONSTRAINT "FK_sender" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_confession" FOREIGN KEY ("confessionId") REFERENCES "confession"("id") ON DELETE CASCADE
        )`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "messages"`);
    }
}
