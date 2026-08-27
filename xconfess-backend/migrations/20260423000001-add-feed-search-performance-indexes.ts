import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeedSearchPerformanceIndexes2026042300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_moderation_created 
      ON confessions(moderation_status, created_at DESC) 
      WHERE is_deleted = false AND is_hidden = false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_gender_active 
      ON confessions(gender, created_at DESC) 
      WHERE is_deleted = false AND is_hidden = false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_trending_window 
      ON confessions(created_at DESC) 
      WHERE is_deleted = false AND is_hidden = false 
      AND moderation_status = 'APPROVED';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_confessions_search_content 
      ON confessions USING gin(to_tsvector('english', message));
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_parent_confession 
      ON comments(parent_id, confession_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_anonymous_users_created 
      ON anonymous_users(created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_moderation_created;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_gender_active;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_trending_window;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_confessions_search_content;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_comments_parent_confession;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_anonymous_users_created;`);
  }
}
