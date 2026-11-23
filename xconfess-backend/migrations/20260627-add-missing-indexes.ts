import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingIndexes2026062700001 implements MigrationInterface {
  name = 'AddMissingIndexes2026062700001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements: Array<{
      table: string;
      columns: string[];
      sql: string;
    }> = [
      // Confession created_at indexes (both naming variants present in repo history)
      {
        table: 'anonymous_confessions',
        columns: ['created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confession_created_at ON anonymous_confessions(created_at DESC);`,
      },
      {
        table: 'confessions',
        columns: ['created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_created_at ON confessions(created_at DESC);`,
      },

      // Confession owner indexes
      {
        table: 'anonymous_confessions',
        columns: ['anonymous_user_id'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_anonymous_user_id ON anonymous_confessions(anonymous_user_id);`,
      },
      {
        table: 'confessions',
        columns: ['user_id'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_user_id ON confessions(user_id);`,
      },

      // Composite active/recent queries
      {
        table: 'anonymous_confessions',
        columns: ['is_deleted', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_confessions_active_recent ON anonymous_confessions(is_deleted, created_at DESC) WHERE is_deleted = false;`,
      },

      // Reaction indexes (cover both plural/singular table names and both anonymous/authenticated user fk variants)
      {
        table: 'reactions',
        columns: ['confession_id'],
        sql: `CREATE INDEX IF NOT EXISTS idx_reactions_confession_id ON reactions(confession_id);`,
      },
      {
        table: 'reaction',
        columns: ['confession_id'],
        sql: `CREATE INDEX IF NOT EXISTS idx_reaction_confession_id ON reaction(confession_id);`,
      },
      {
        table: 'reactions',
        columns: ['confession_id', 'anonymous_user_id'],
        sql: `CREATE INDEX IF NOT EXISTS idx_reactions_confession_anonymous_user ON reactions(confession_id, anonymous_user_id);`,
      },
      {
        table: 'reactions',
        columns: ['confession_id', 'user_id'],
        sql: `CREATE INDEX IF NOT EXISTS idx_reactions_confession_user ON reactions(confession_id, user_id);`,
      },

      // Comments by confession (cover different column naming used in raw SQL)
      {
        table: 'comments',
        columns: ['confessionId'],
        sql: `CREATE INDEX IF NOT EXISTS idx_comments_confessionId ON comments("confessionId");`,
      },
      {
        table: 'comments',
        columns: ['confession_id'],
        sql: `CREATE INDEX IF NOT EXISTS idx_comments_confession_id ON comments(confession_id);`,
      },

      // Reports status for admin dashboards
      {
        table: 'reports',
        columns: ['status', 'created_at'],
        sql: `CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);`,
      },
    ];

    for (const statement of statements) {
      if (await this.hasColumns(queryRunner, statement.table, statement.columns)) {
        await queryRunner.query(statement.sql);
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
