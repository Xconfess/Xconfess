import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageIdempotencyKey20261022000001 implements MigrationInterface {
  name = 'AddMessageIdempotencyKey20261022000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(64)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_messages_idempotency_key" ON "messages" ("idempotency_key")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_messages_idempotency_key"',
    );
    await queryRunner.query(
      'ALTER TABLE "messages" DROP COLUMN IF EXISTS "idempotency_key"',
    );
  }
}
