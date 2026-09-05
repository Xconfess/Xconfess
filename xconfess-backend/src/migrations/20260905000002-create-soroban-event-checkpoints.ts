import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSorobanEventCheckpoints20260905000002
  implements MigrationInterface
{
  name = 'CreateSorobanEventCheckpoints20260905000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "soroban_event_checkpoints" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "network" varchar(16) NOT NULL,
        "contract_id" varchar(56) NOT NULL,
        "last_ledger" bigint NOT NULL DEFAULT 0,
        "last_cursor" varchar(256),
        "indexed_events" integer NOT NULL DEFAULT 0,
        "failed_events" integer NOT NULL DEFAULT 0,
        "last_error_code" varchar(64),
        "last_error_at" timestamptz,
        "last_indexed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_soroban_event_checkpoint_network_contract"
          UNIQUE ("network", "contract_id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_soroban_event_checkpoints_last_indexed"
        ON "soroban_event_checkpoints" ("last_indexed_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "soroban_event_checkpoints";');
  }
}
