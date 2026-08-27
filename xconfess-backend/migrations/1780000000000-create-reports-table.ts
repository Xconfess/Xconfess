import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportsTable1780000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE reports_type_enum AS ENUM (
        'spam','harassment','hate_speech','inappropriate','misinformation','other'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE reports_status_enum AS ENUM (
        'pending','reviewing','resolved','dismissed'
      );
    `);
    await queryRunner.query(`
      CREATE TABLE reports (
        id               SERIAL PRIMARY KEY,
        reporter_id      integer REFERENCES users(id) ON DELETE SET NULL,
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
    await queryRunner.query(`CREATE INDEX idx_reports_reporter_id     ON reports(reporter_id)`);
    await queryRunner.query(`CREATE INDEX idx_reports_status          ON reports(status)`);
    await queryRunner.query(`CREATE INDEX idx_reports_idempotency_key ON reports(idempotency_key)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS reports`);
    await queryRunner.query(`DROP TYPE IF EXISTS reports_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS reports_type_enum`);
  }
}