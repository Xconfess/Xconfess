import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: add threaded comment support columns
 *
 * Adds:
 *   - comments.edited_at        — timestamp of last edit (null if never edited)
 *   - comments.mentioned_usernames — comma-separated @mention usernames
 *   - notifications type enum   — adds MENTION and COMMENT_REPLY values
 */
export class AddThreadedCommentColumns20260628000001
  implements MigrationInterface
{
  name = "AddThreadedCommentColumns20260628000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('comments')) {
    // Add editedAt column
    await queryRunner.query(`
      ALTER TABLE "comments"
      ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP DEFAULT NULL
    `);

    // Add mentionedUsernames column (stored as comma-separated text)
    await queryRunner.query(`
      ALTER TABLE "comments"
      ADD COLUMN IF NOT EXISTS "mentionedUsernames" TEXT DEFAULT NULL
    `);
    }

    // Extend notification type enum with new values
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications_type_enum') THEN
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'mention';
          ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'comment_reply';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('comments'))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "comments" DROP COLUMN IF EXISTS "editedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "comments" DROP COLUMN IF EXISTS "mentionedUsernames"
    `);
    // Note: PostgreSQL does not support removing enum values.
    // To roll back enum changes, recreate the type without the new values.
  }
}
