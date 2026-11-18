import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Older schema migrations use uuid_generate_v4() for UUID defaults. Enable the
 * extension before those migrations so a clean PostgreSQL database can run
 * the migration history without relying on a pre-provisioned schema.
 */
export class EnableUuidOssp20240101000000 implements MigrationInterface {
  name = 'EnableUuidOssp20240101000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Keep the extension installed: tables outside this migration history may
    // still use uuid_generate_v4() as a column default.
  }
}
