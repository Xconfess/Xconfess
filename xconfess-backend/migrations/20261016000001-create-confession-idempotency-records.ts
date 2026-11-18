import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConfessionIdempotencyRecords20261016000001
  implements MigrationInterface
{
  name = 'CreateConfessionIdempotencyRecords20261016000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('confession_idempotency_records'))) {
      await queryRunner.query(`
        CREATE TABLE confession_idempotency_records (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          idempotency_key varchar(255) NOT NULL,
          payload_hash varchar(64) NOT NULL,
          status varchar(16) NOT NULL DEFAULT 'processing',
          response_status integer NULL,
          response_body jsonb NULL,
          confession_id uuid NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
          CONSTRAINT uq_confession_idempotency_records_key UNIQUE (idempotency_key)
        )
      `);
    }
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_confession_idempotency_records_expires_at ON confession_idempotency_records (expires_at)',
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.anonymous_confessions') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname IN (
              'fk_confession_idempotency_records_confession',
              'fk_cir_confession_id'
            )
          ) THEN
          ALTER TABLE confession_idempotency_records
            ADD CONSTRAINT fk_confession_idempotency_records_confession
            FOREIGN KEY (confession_id)
            REFERENCES anonymous_confessions(id)
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE IF EXISTS confession_idempotency_records DROP CONSTRAINT IF EXISTS fk_confession_idempotency_records_confession',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_confession_idempotency_records_expires_at',
    );
  }
}
