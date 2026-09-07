import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration adding optimized composite indexes for high-traffic auth, feed,
 * notifications, reactions, and comment threading queries (#1731).
 */
export class AddAuthFeedNotificationsAuditIndexes20260827000001
  implements MigrationInterface
{
  name = 'AddAuthFeedNotificationsAuditIndexes20260827000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const indexStatements: Array<{
      table: string;
      columns: string[];
      sql: string;
    }> = [
      // 1. User authentication and password recovery paths
      {
        table: 'user',
        columns: ['username', 'role', 'is_active'],
        sql: `CREATE INDEX IF NOT EXISTS idx_users_auth_lookup ON "user" ("username", "role", "is_active");`,
      },
      {
        table: 'users',
        columns: ['username', 'role', 'is_active'],
        sql: `CREATE INDEX IF NOT EXISTS idx_users_auth_lookup_plural ON "users" ("username", "role", "is_active");`,
      },
      {
        table: 'user',
        columns: ['email_hash'],
        sql: `CREATE INDEX IF NOT EXISTS idx_users_email_hash ON "user" ("email_hash");`,
      },
      {
        table: 'users',
        columns: ['email_hash'],
        sql: `CREATE INDEX IF NOT EXISTS idx_users_email_hash_plural ON "users" ("email_hash");`,
      },
      {
        table: 'user',
        columns: ['resetPasswordToken', 'resetPasswordExpires'],
        sql: `CREATE INDEX IF NOT EXISTS idx_users_password_reset ON "user" ("resetPasswordToken", "resetPasswordExpires");`,
      },
      {
        table: 'user',
        columns: ['reset_password_token', 'reset_password_expires'],
        sql: `CREATE INDEX IF NOT EXISTS idx_users_password_reset_snake ON "user" ("reset_password_token", "reset_password_expires");`,
      },

      // 2. Anonymous confession feed queries & scheduling
      {
        table: 'anonymous_confessions',
        columns: ['is_deleted', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_feed_active_created ON "anonymous_confessions" ("is_deleted", "created_at" DESC) WHERE "is_deleted" = false;`,
      },
      {
        table: 'anonymous_confessions',
        columns: ['is_deleted', 'scheduled_for', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_feed_scheduled ON "anonymous_confessions" ("is_deleted", "scheduled_for", "created_at" DESC);`,
      },
      {
        table: 'anonymous_confessions',
        columns: ['status', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_status_created ON "anonymous_confessions" ("status", "created_at" DESC);`,
      },
      {
        table: 'anonymous_confessions',
        columns: ['gender', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_gender_created ON "anonymous_confessions" ("gender", "created_at" DESC);`,
      },
      {
        table: 'anonymous_confessions',
        columns: ['anonymous_user_id', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_author_created ON "anonymous_confessions" ("anonymous_user_id", "created_at" DESC);`,
      },
      {
        table: 'anonymous_confessions',
        columns: ['is_deleted', 'view_count'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_active_views ON "anonymous_confessions" ("is_deleted", "view_count" DESC);`,
      },

      // 3. Notification feed and email worker queries
      {
        table: 'notifications',
        columns: ['userId', 'isRead', 'createdAt'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_user_feed ON "notifications" ("userId", "isRead", "createdAt" DESC);`,
      },
      {
        table: 'notifications',
        columns: ['user_id', 'is_read', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_user_feed_snake ON "notifications" ("user_id", "is_read", "created_at" DESC);`,
      },
      {
        table: 'notifications',
        columns: ['isEmailSent', 'createdAt'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_email_delivery ON "notifications" ("isEmailSent", "createdAt" ASC) WHERE "isEmailSent" = false;`,
      },
      {
        table: 'notifications',
        columns: ['is_email_sent', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_notifications_email_delivery_snake ON "notifications" ("is_email_sent", "created_at" ASC) WHERE "is_email_sent" = false;`,
      },

      // 4. Reactions and Aggregations
      {
        table: 'reactions',
        columns: ['confession_id', 'type'],
        sql: `CREATE INDEX IF NOT EXISTS idx_reactions_confession_type ON "reactions" ("confession_id", "type");`,
      },
      {
        table: 'reactions',
        columns: ['confessionId', 'type'],
        sql: `CREATE INDEX IF NOT EXISTS idx_reactions_confession_type_camel ON "reactions" ("confessionId", "type");`,
      },
      {
        table: 'reaction',
        columns: ['confession_id', 'type'],
        sql: `CREATE INDEX IF NOT EXISTS idx_reaction_confession_type ON "reaction" ("confession_id", "type");`,
      },

      // 5. Comment threading and hierarchy
      {
        table: 'comments',
        columns: ['confessionId', 'parentId', 'createdAt'],
        sql: `CREATE INDEX IF NOT EXISTS idx_comments_confession_parent ON "comments" ("confessionId", "parentId", "createdAt" ASC);`,
      },
      {
        table: 'comments',
        columns: ['confession_id', 'parent_id', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_comments_confession_parent_snake ON "comments" ("confession_id", "parent_id", "created_at" ASC);`,
      },

      // 6. Bookmarks lookup
      {
        table: 'bookmarks',
        columns: ['userId', 'confessionId'],
        sql: `CREATE INDEX IF NOT EXISTS idx_bookmarks_user_confession ON "bookmarks" ("userId", "confessionId");`,
      },
      {
        table: 'bookmarks',
        columns: ['user_id', 'confession_id'],
        sql: `CREATE INDEX IF NOT EXISTS idx_bookmarks_user_confession_snake ON "bookmarks" ("user_id", "confession_id");`,
      },
    ];

    for (const index of indexStatements) {
      if (await this.hasColumns(queryRunner, index.table, index.columns)) {
        await queryRunner.query(index.sql);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops = [
      `DROP INDEX IF EXISTS idx_users_auth_lookup;`,
      `DROP INDEX IF EXISTS idx_users_auth_lookup_plural;`,
      `DROP INDEX IF EXISTS idx_users_email_hash;`,
      `DROP INDEX IF EXISTS idx_users_email_hash_plural;`,
      `DROP INDEX IF EXISTS idx_users_password_reset;`,
      `DROP INDEX IF EXISTS idx_users_password_reset_snake;`,
      `DROP INDEX IF EXISTS idx_confessions_feed_active_created;`,
      `DROP INDEX IF EXISTS idx_confessions_feed_scheduled;`,
      `DROP INDEX IF EXISTS idx_confessions_status_created;`,
      `DROP INDEX IF EXISTS idx_confessions_gender_created;`,
      `DROP INDEX IF EXISTS idx_confessions_author_created;`,
      `DROP INDEX IF EXISTS idx_confessions_active_views;`,
      `DROP INDEX IF EXISTS idx_notifications_user_feed;`,
      `DROP INDEX IF EXISTS idx_notifications_user_feed_snake;`,
      `DROP INDEX IF EXISTS idx_notifications_email_delivery;`,
      `DROP INDEX IF EXISTS idx_notifications_email_delivery_snake;`,
      `DROP INDEX IF EXISTS idx_reactions_confession_type;`,
      `DROP INDEX IF EXISTS idx_reactions_confession_type_camel;`,
      `DROP INDEX IF EXISTS idx_reaction_confession_type;`,
      `DROP INDEX IF EXISTS idx_comments_confession_parent;`,
      `DROP INDEX IF EXISTS idx_comments_confession_parent_snake;`,
      `DROP INDEX IF EXISTS idx_bookmarks_user_confession;`,
      `DROP INDEX IF EXISTS idx_bookmarks_user_confession_snake;`,
    ];

    for (const sql of drops) {
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
      result.map((row: { column_name: string }) => row.column_name),
    );

    return columns.every((column) => existingColumns.has(column));
  }
}
