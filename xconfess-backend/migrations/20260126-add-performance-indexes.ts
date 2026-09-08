import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes2026012600001 implements MigrationInterface {
  name = 'AddPerformanceIndexes2026012600001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index for sorting confessions by creation date (most common query)
    if (await this.hasColumns(queryRunner, 'confessions', ['created_at'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_created_at 
      ON confessions(created_at DESC);
    `);
    }

    // Index for filtering confessions by user
    if (await this.hasColumns(queryRunner, 'confessions', ['user_id'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_user_id 
      ON confessions(user_id);
    `);
    }

    // Index for filtering confessions by anonymous user
    if (await this.hasColumns(queryRunner, 'confessions', ['anonymous_user_id'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_anonymous_user_id 
      ON confessions(anonymous_user_id);
    `);
    }

    // Composite index for active confessions sorted by date (very common query)
    if (await this.hasColumns(queryRunner, 'confessions', ['is_deleted', 'created_at'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_active_recent 
      ON confessions(is_deleted, created_at DESC) 
      WHERE is_deleted = false;
    `);
    }

    // Index for filtering by moderation status
    if (await this.hasColumns(queryRunner, 'confessions', ['moderation_status', 'is_hidden'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_moderation_status 
      ON confessions(moderation_status, is_hidden);
    `);
    }

    // Index for reactions by confession (N+1 query fix)
    if (await this.hasColumns(queryRunner, 'reactions', ['confession_id'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reactions_confession_id 
      ON reactions(confession_id);
    `);
    }

    // Composite index for unique user reactions check
    if (await this.hasColumns(queryRunner, 'reactions', ['user_id', 'confession_id'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reactions_user_confession 
      ON reactions(user_id, confession_id);
    `);
    }

    // Index for comments by confession
    if (await this.hasColumns(queryRunner, 'comments', ['confession_id'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_confession_id 
      ON comments(confession_id);
    `);
    }

    // Index for reports by confession
    if (await this.hasColumns(queryRunner, 'reports', ['confession_id'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_confession_id 
      ON reports(confession_id);
    `);
    }

    // Index for reports by status (admin dashboard)
    if (await this.hasColumns(queryRunner, 'reports', ['status', 'created_at'])) {
      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_status 
      ON reports(status, created_at DESC);
    `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_created_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_user_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_anonymous_user_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_active_recent;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_moderation_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_reactions_confession_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_reactions_user_confession;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_comments_confession_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_reports_confession_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_reports_status;`);
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
