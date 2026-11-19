import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keep the identifiers used during account creation unique in PostgreSQL,
 * including deployments where synchronize is disabled. The preflight raises
 * a useful error instead of silently choosing a duplicate account.
 */
export class EnforceUserIdentifierUniqueness20260927000003 implements MigrationInterface {
  name = 'EnforceUserIdentifierUniqueness20260927000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user'))) return;

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "user" GROUP BY "username" HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Cannot enforce username uniqueness: duplicate usernames exist';
        END IF;
        IF EXISTS (
          SELECT 1 FROM "user" WHERE "email_hash" IS NOT NULL
          GROUP BY "email_hash" HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Cannot enforce email uniqueness: duplicate email hashes exist';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_username"
      ON "user" ("username");
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_email_hash"
      ON "user" ("email_hash");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user'))) return;
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_email_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_username"`);
  }
}
