import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hashed, single-use two-factor recovery codes.
 *
 * Legacy recovery codes were kept as an encrypted JSON array on "user"; those
 * columns stay for backward compatibility and are converted to hashes (and
 * cleared) the first time a user redeems, regenerates or revokes codes.
 */
export class CreateUserRecoveryCodes20261119000002 implements MigrationInterface {
  name = 'CreateUserRecoveryCodes20261119000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_recovery_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL,
        "batch_id" uuid NOT NULL,
        "code_hash" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "used_at" timestamptz,
        "revoked_at" timestamptz
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_recovery_codes_user_id"
        ON "user_recovery_codes" ("user_id");
    `);

    if (await queryRunner.hasTable('user')) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_recovery_codes_user'
          ) THEN
            ALTER TABLE "user_recovery_codes"
              ADD CONSTRAINT "fk_user_recovery_codes_user"
              FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
          END IF;
        END
        $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "user_recovery_codes";');
  }
}
