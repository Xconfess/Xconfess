import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds composite indexes backing the bounded/cursor-paginated message
 * history queries added for #2008 (`findForConfessionThread`,
 * `findAllThreadsForUser`). Without these, the cursor `WHERE` clauses on
 * `senderId`/`confessionId` + `createdAt` fall back to a full table scan on
 * `messages`, which defeats the purpose of bounding the page size as the
 * table grows.
 */
export class AddMessageHistoryPaginationIndexes20260927000001
  implements MigrationInterface
{
  name = 'AddMessageHistoryPaginationIndexes20260927000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Thread query: WHERE confessionId = :id AND senderId = :id ORDER BY createdAt
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_messages_thread_history ON "messages" ("confessionId", "senderId", "createdAt");`,
    );

    // All-threads-for-user query: filters by senderId, orders by createdAt DESC
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_messages_sender_history ON "messages" ("senderId", "createdAt" DESC);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_messages_thread_history;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_messages_sender_history;`);
  }
}
