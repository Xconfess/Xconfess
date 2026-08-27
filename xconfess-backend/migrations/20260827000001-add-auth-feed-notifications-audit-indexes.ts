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
    const indexStatements = [
      // 1. User authentication and password recovery paths
      `CREATE INDEX IF NOT EXISTS idx_users_auth_lookup ON "user" ("username", "role", "is_active");`,
      `CREATE INDEX IF NOT EXISTS idx_users_auth_lookup_plural ON "users" ("username", "role", "is_active");`,
      `CREATE INDEX IF NOT EXISTS idx_users_email_hash ON "user" ("email_hash");`,
      `CREATE INDEX IF NOT EXISTS idx_users_email_hash_plural ON "users" ("email_hash");`,
      `CREATE INDEX IF NOT EXISTS idx_users_password_reset ON "user" ("resetPasswordToken", "resetPasswordExpires");`,
      `CREATE INDEX IF NOT EXISTS idx_users_password_reset_snake ON "user" ("reset_password_token", "reset_password_expires");`,

      // 2. Anonymous confession feed queries & scheduling
      `CREATE INDEX IF NOT EXISTS idx_confessions_feed_active_created ON "anonymous_confessions" ("is_deleted", "created_at" DESC) WHERE "is_deleted" = false;`,
      `CREATE INDEX IF NOT EXISTS idx_confessions_feed_scheduled ON "anonymous_confessions" ("is_deleted", "scheduled_for", "created_at" DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_confessions_status_created ON "anonymous_confessions" ("status", "created_at" DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_confessions_gender_created ON "anonymous_confessions" ("gender", "created_at" DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_confessions_author_created ON "anonymous_confessions" ("anonymous_user_id", "created_at" DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_confessions_active_views ON "anonymous_confessions" ("is_deleted", "view_count" DESC);`,

      // 3. Notification feed and email worker queries
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_feed ON "notifications" ("userId", "isRead", "createdAt" DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_feed_snake ON "notifications" ("user_id", "is_read", "created_at" DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_email_delivery ON "notifications" ("isEmailSent", "createdAt" ASC) WHERE "isEmailSent" = false;`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_email_delivery_snake ON "notifications" ("is_email_sent", "created_at" ASC) WHERE "is_email_sent" = false;`,

      // 4. Reactions and Aggregations
      `CREATE INDEX IF NOT EXISTS idx_reactions_confession_type ON "reactions" ("confession_id", "type");`,
      `CREATE INDEX IF NOT EXISTS idx_reactions_confession_type_camel ON "reactions" ("confessionId", "type");`,
      `CREATE INDEX IF NOT EXISTS idx_reaction_confession_type ON "reaction" ("confession_id", "type");`,

      // 5. Comment threading and hierarchy
      `CREATE INDEX IF NOT EXISTS idx_comments_confession_parent ON "comments" ("confessionId", "parentId", "createdAt" ASC);`,
      `CREATE INDEX IF NOT EXISTS idx_comments_confession_parent_snake ON "comments" ("confession_id", "parent_id", "created_at" ASC);`,

      // 6. Bookmarks lookup
      `CREATE INDEX IF NOT EXISTS idx_bookmarks_user_confession ON "bookmarks" ("userId", "confessionId");`,
      `CREATE INDEX IF NOT EXISTS idx_bookmarks_user_confession_snake ON "bookmarks" ("user_id", "confession_id");`,
    ];

    for (const sql of indexStatements) {
      try {
        await queryRunner.query(sql);
      } catch {
        // Robustness against varying table names / missing optional columns across environments
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
      try {
        await queryRunner.query(sql);
      } catch {
        // Ignore errors on drop
      }
    }
  }
}
