import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes the column that resolves conversation membership for #2007.
 *
 * `MessagesService.findAllThreadsForUser` authorizes/lists a user's
 * conversations with:
 *
 *   .where([
 *     { sender: { id: In(anonIds) } },
 *     { confession: { anonymousUser: { id: In(anonIds) } } },
 *   ])
 *
 * The first branch (`messages.senderId`) is already covered by
 * `idx_messages_sender_history` (see #2008's
 * add-message-history-pagination-indexes migration). The second branch joins
 * through `anonymous_confessions.anonymous_user_id` to find every confession
 * one of the caller's anonymous identities authored — and that column had no
 * index at all, forcing a sequential scan of `anonymous_confessions` on
 * every "list my conversations" call. This does not expose or introduce any
 * new anonymous-identity data; it only indexes an existing FK column that
 * every authorization check on this path already reads.
 */
export class AddConfessionAnonymousUserIndex20260927000002
  implements MigrationInterface
{
  name = 'AddConfessionAnonymousUserIndex20260927000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_anonymous_confessions_anonymous_user_id ON "anonymous_confessions" ("anonymous_user_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_anonymous_confessions_anonymous_user_id;`,
    );
  }
}
