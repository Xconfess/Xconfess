import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportsTable1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reports_type_enum') THEN
          CREATE TYPE reports_type_enum AS ENUM (
            'spam','harassment','hate_speech','inappropriate','misinformation','other'
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reports_status_enum') THEN
          CREATE TYPE reports_status_enum AS ENUM (
            'pending','reviewing','resolved','dismissed'
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id               SERIAL PRIMARY KEY,
        reporter_id      integer,
        confession_id    integer NOT NULL,
        type             reports_type_enum NOT NULL DEFAULT 'other',
        status           reports_status_enum NOT NULL DEFAULT 'pending',
        note             text,
        idempotency_key  varchar(64) NOT NULL UNIQUE,
        idempotency_response jsonb,
        created_at       TIMESTAMP NOT NULL DEFAULT now(),
        updated_at       TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'users'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_reports_reporter_id_users'
        ) THEN
          ALTER TABLE reports
            ADD CONSTRAINT fk_reports_reporter_id_users
            FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_reports_reporter_id     ON reports(reporter_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_reports_status          ON reports(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_reports_idempotency_key ON reports(idempotency_key)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reports`);
    await queryRunner.query(`DROP TYPE IF EXISTS reports_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS reports_type_enum`);
  }
}
