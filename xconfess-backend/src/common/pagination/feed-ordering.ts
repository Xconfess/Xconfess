import { encodeCursor } from './cursor.util';

export type OrderDirection = 'ASC' | 'DESC';

/**
 * Minimal query-builder surface required to apply feed ordering. Keeping this
 * structural (rather than importing TypeORM's SelectQueryBuilder) lets the
 * same helpers drive both the production service and lightweight test doubles.
 */
export interface FeedOrderableQueryBuilder {
  orderBy(column: string, direction?: OrderDirection): unknown;
  addOrderBy(column: string, direction?: OrderDirection): unknown;
}

/**
 * Canonical tie-breaker for every confession feed ordering (Issue #2118).
 *
 * `created_at` is NOT unique: bulk imports, scheduled releases, and confessions
 * created inside the same transaction/second routinely share an identical
 * timestamp. Without a unique discriminator PostgreSQL is free to return tied
 * rows in any physical order, so the same page can duplicate or skip rows when
 * a query is repeated. `id` is unique, so it is always the final sort key.
 *
 * These constants are the single source of truth: the SQL ORDER BY clause and
 * the keyset cursor are both built from them, which is what keeps page and
 * cursor pagination from ever drifting apart.
 */
export const FEED_TIEBREAKER_COLUMN = 'id';
export const FEED_TIEBREAKER_DIRECTION: OrderDirection = 'DESC';

/**
 * Apply the canonical newest-first feed ordering: `created_at DESC, id DESC`.
 * Use this (not raw `orderBy`) for any feed whose primary sort is the
 * creation timestamp.
 */
export function applyNewestFeedOrder<T extends FeedOrderableQueryBuilder>(
  qb: T,
  alias = 'confession',
): T {
  qb.orderBy(`${alias}.created_at`, 'DESC');
  qb.addOrderBy(
    `${alias}.${FEED_TIEBREAKER_COLUMN}`,
    FEED_TIEBREAKER_DIRECTION,
  );
  return qb;
}

/**
 * Append the canonical tie-breakers after a computed/aggregate primary sort
 * (trending score, reaction count, comment count, ...). Aggregate scores
 * collide far more often than timestamps do, so `created_at DESC, id DESC`
 * must follow every such sort to keep pages deterministic.
 */
export function applyFeedTieBreakers<T extends FeedOrderableQueryBuilder>(
  qb: T,
  alias = 'confession',
): T {
  qb.addOrderBy(`${alias}.created_at`, 'DESC');
  qb.addOrderBy(
    `${alias}.${FEED_TIEBREAKER_COLUMN}`,
    FEED_TIEBREAKER_DIRECTION,
  );
  return qb;
}

/** A row reduced to its feed sort position (timestamp + unique id). */
export interface FeedCursorRow {
  id: string | number;
  created_at: string | Date;
}

/** Serializable keyset position carried inside a feed cursor. */
export interface FeedCursorPosition {
  id: string;
  created_at: string;
}

/**
 * Normalise a feed row into the exact position stored in the cursor. The
 * cursor therefore always carries the same two keys the ORDER BY uses.
 */
export function toFeedCursorPosition(row: FeedCursorRow): FeedCursorPosition {
  return {
    id: String(row.id),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

/** Encode the next-page cursor from the last row of the current page. */
export function encodeFeedCursor(row: FeedCursorRow): string {
  return encodeCursor(toFeedCursorPosition(row));
}

/**
 * Build the keyset predicate that resumes a feed *after* the cursor position.
 *
 * Row-value comparison `(created_at, id) < (:createdAt, :id)` is used both by
 * the main feed and the tag feed so every keyset page consumes exactly the
 * ordering defined above. Postgres can also satisfy it directly from the feed
 * keyset index.
 */
export function feedKeysetPredicate(
  position: FeedCursorPosition,
  alias = 'confession',
): {
  sql: string;
  params: { createdAt: Date; id: string };
} {
  return {
    sql: `(${alias}.created_at, ${alias}.${FEED_TIEBREAKER_COLUMN}) < (:createdAt, :id)`,
    // Bind as a Date so pg uses the same timezone conversion as timestamp
    // inserts. A raw ISO string loses its offset for timestamp-without-timezone.
    params: { createdAt: new Date(position.created_at), id: position.id },
  };
}
