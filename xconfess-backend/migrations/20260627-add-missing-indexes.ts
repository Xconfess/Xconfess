import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingIndexes2026062700001 implements MigrationInterface {
  name = 'AddMissingIndexes2026062700001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      // Confession created_at indexes (both naming variants present in repo history)
      `CREATE INDEX IF NOT EXISTS idx_confession_created_at ON anonymous_confessions(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_confessions_created_at ON confessions(created_at DESC);`,

      // Confession owner indexes
      `CREATE INDEX IF NOT EXISTS idx_confessions_anonymous_user_id ON anonymous_confessions(anonymous_user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_confessions_user_id ON confessions(user_id);`,

      // Composite active/recent queries
      `CREATE INDEX IF NOT EXISTS idx_confessions_active_recent ON anonymous_confessions(is_deleted, created_at DESC) WHERE is_deleted = false;`,

      // Reaction indexes (cover both plural/singular table names and both anonymous/authenticated user fk variants)
      `CREATE INDEX IF NOT EXISTS idx_reactions_confession_id ON reactions(confession_id);`,
      `CREATE INDEX IF NOT EXISTS idx_reaction_confession_id ON reaction(confession_id);`,
      `CREATE INDEX IF NOT EXISTS idx_reactions_confession_anonymous_user ON reactions(confession_id, anonymous_user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_reactions_confession_user ON reactions(confession_id, user_id);`,

      // Comments by confession (cover different column naming used in raw SQL)
      `CREATE INDEX IF NOT EXISTS idx_comments_confessionId ON comments("confessionId");`,
      `CREATE INDEX IF NOT EXISTS idx_comments_confession_id ON comments(confession_id);`,

      // Reports status for admin dashboards
      `CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);`,
    ];

    for (const sql of statements) {
      try {
        // individual try/catch to be robust across schema variants
        // eslint-disable-next-line no-await-in-loop
        await queryRunner.query(sql);
      } catch (err) {
        // ignore errors to make migration idempotent across environments
        // and to avoid failing when a table variant is not present
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops = [
      `DROP INDEX IF EXISTS idx_confession_created_at;`,
      `DROP INDEX IF EXISTS idx_confessions_created_at;`,
      `DROP INDEX IF EXISTS idx_confessions_anonymous_user_id;`,
      `DROP INDEX IF EXISTS idx_confessions_user_id;`,
      `DROP INDEX IF EXISTS idx_confessions_active_recent;`,
      `DROP INDEX IF EXISTS idx_reactions_confession_id;`,
      `DROP INDEX IF EXISTS idx_reaction_confession_id;`,
      `DROP INDEX IF EXISTS idx_reactions_confession_anonymous_user;`,
      `DROP INDEX IF EXISTS idx_reactions_confession_user;`,
      `DROP INDEX IF EXISTS idx_comments_confessionId;`,
      `DROP INDEX IF EXISTS idx_comments_confession_id;`,
      `DROP INDEX IF EXISTS idx_reports_status;`,
    ];

    for (const sql of drops) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await queryRunner.query(sql);
      } catch (err) {
        // ignore
      }
    }
  }
}
