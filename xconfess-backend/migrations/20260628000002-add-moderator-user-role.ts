import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModeratorUserRole20260628000002 implements MigrationInterface {
  name = 'AddModeratorUserRole20260628000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_enum
            WHERE enumlabel = 'moderator'
              AND enumtypid = 'user_role_enum'::regtype
          ) THEN
            ALTER TYPE "user_role_enum" ADD VALUE 'moderator';
          END IF;
        END IF;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely in place.
  }
}
