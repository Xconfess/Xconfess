import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feed query indexes (#1933). Existing coverage already handles gender,
 * author, and reaction-count lookups (see 20260627 / 20260827 migrations);
 * these close the two remaining gaps in ConfessionService.getConfessions.
 */
export const FEED_KEYSET_INDEXES = [
  {
    // NEWEST feed: ORDER BY created_at DESC, id DESC with the keyset cursor
    // (created_at, id) < (:createdAt, :id). The partial predicate matches the
    // always-on isDeleted/isHidden filters so the scan reads only live rows.
    // Note: the entity column is "isDeleted" (camelCase), not is_deleted;
    // older migrations probing is_deleted skip silently on real schemas.
    name: 'idx_confessions_feed_keyset',
    table: 'anonymous_confessions',
    columns: ['created_at', 'id', 'isDeleted', 'is_hidden'],
    sql: `CREATE INDEX IF NOT EXISTS "idx_confessions_feed_keyset" ON "anonymous_confessions" ("created_at" DESC, "id" DESC) WHERE "isDeleted" = false AND "is_hidden" = false;`,
  },
  {
    // MOST_DISCUSSED feed: correlated COUNT(*) FROM comments WHERE
    // "confessionId" = ? AND "isDeleted" = false, run once per candidate row.
    name: 'idx_comments_confession_active',
    table: 'comments',
    columns: ['confessionId', 'isDeleted'],
    sql: `CREATE INDEX IF NOT EXISTS "idx_comments_confession_active" ON "comments" ("confessionId") WHERE "isDeleted" = false;`,
  },
] as const;

export class AddFeedKeysetIndexes20260923000001 implements MigrationInterface {
  name = 'AddFeedKeysetIndexes20260923000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of FEED_KEYSET_INDEXES) {
      const table = await queryRunner.getTable(index.table);
      const hasColumns =
        table && index.columns.every((c) => table.findColumnByName(c));
      if (hasColumns) {
        await queryRunner.query(index.sql);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of FEED_KEYSET_INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${index.name}";`);
    }
  }
}
