import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds indexes backing notification recipient and unread/status access paths
 * (#1986).
 *
 * Actual query patterns served by `NotificationService`:
 *
 *  1. `getUserNotifications` (all states)
 *       WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT/OFFSET
 *     -> idx_notifications_recipient_created
 *
 *  2. `getUserNotifications` (unreadOnly) + unread badge count + mark-all-read
 *       WHERE "userId" = $1 AND "isRead" = false [ORDER BY "createdAt" DESC]
 *     -> idx_notifications_recipient_unread
 *
 *  3. `getRecentMessageNotifications` used by message batching
 *       WHERE "userId" = $1 AND "type" = $2 AND "isRead" = false
 *             AND "createdAt" > $3 ORDER BY "createdAt" DESC
 *     -> idx_notifications_recipient_type_unread
 *
 * The existing `idx_notifications_user_feed` index (`userId, isRead,
 * createdAt`) already accelerates the unread feed, but PostgreSQL cannot use it
 * to satisfy `ORDER BY "createdAt"` when only `userId` is constrained (because
 * `isRead` sits in the middle of the key). The indexes below cover the
 * remaining access paths without duplicating that existing index.
 *
 * Column casing is detected defensively, matching the pattern used by
 * AddAuthFeedNotificationsAuditIndexes20260827000001, so the migration is safe
 * whether the table was created with camelCase or snake_case columns.
 */
export class AddNotificationRecipientUnreadIndexes20261016000001 implements MigrationInterface {
  name = 'AddNotificationRecipientUnreadIndexes20261016000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements: Array<{
      table: string;
      columns: string[];
      sql: string;
    }> = [
      // Recipient feed across every read state.
      {
        table: 'notifications',
        columns: ['userId', 'createdAt'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON "notifications" ("userId", "createdAt" DESC);`,
      },
      // Recipient unread badge count + mark-all-read.
      {
        table: 'notifications',
        columns: ['userId', 'isRead'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON "notifications" ("userId", "isRead");`,
      },
      // Recipient + notification type + unread window (message batching).
      {
        table: 'notifications',
        columns: ['userId', 'type', 'isRead', 'createdAt'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type_unread ON "notifications" ("userId", "type", "isRead", "createdAt" DESC);`,
      },
      // snake_case fallbacks (only created when such columns actually exist).
      {
        table: 'notifications',
        columns: ['user_id', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_snake ON "notifications" ("user_id", "created_at" DESC);`,
      },
      {
        table: 'notifications',
        columns: ['user_id', 'is_read'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread_snake ON "notifications" ("user_id", "is_read");`,
      },
      {
        table: 'notifications',
        columns: ['user_id', 'type', 'is_read', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type_unread_snake ON "notifications" ("user_id", "type", "is_read", "created_at" DESC);`,
      },
    ];

    for (const statement of statements) {
      if (
        await this.hasColumns(queryRunner, statement.table, statement.columns)
      ) {
        await queryRunner.query(statement.sql);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops = [
      `DROP INDEX IF EXISTS idx_notifications_recipient_created;`,
      `DROP INDEX IF EXISTS idx_notifications_recipient_unread;`,
      `DROP INDEX IF EXISTS idx_notifications_recipient_type_unread;`,
      `DROP INDEX IF EXISTS idx_notifications_recipient_created_snake;`,
      `DROP INDEX IF EXISTS idx_notifications_recipient_unread_snake;`,
      `DROP INDEX IF EXISTS idx_notifications_recipient_type_unread_snake;`,
    ];

    for (const sql of drops) {
      // eslint-disable-next-line no-await-in-loop
      await queryRunner.query(sql);
    }
  }

  private async hasColumns(
    queryRunner: QueryRunner,
    table: string,
    columns: string[],
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = ANY($2::text[]);
      `,
      [table, columns],
    );
    const existingColumns = new Set(
      (result ?? []).map((row: { column_name: string }) => row.column_name),
    );

    return columns.every((column) => existingColumns.has(column));
  }
}
