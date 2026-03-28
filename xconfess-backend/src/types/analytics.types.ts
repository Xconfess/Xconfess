// ─── Trending windows ────────────────────────────────────────────────────────

/**
 * Supported trending / analytics time windows.
 * Values represent the number of calendar days in each window.
 */
export enum TrendingWindow {
  DAY = 1,
  WEEK = 7,
  MONTH = 30,
}

/**
 * Inclusive lower boundary (UTC midnight) and exclusive upper boundary
 * (start of the next UTC day after `now`) for a given window.
 *
 * Rules
 * ─────
 * • startAt  – UTC midnight of the day that is `days` calendar days before `now`.
 *              A record with `createdAt = startAt` IS included (>= comparison).
 * • endAt    – UTC midnight of tomorrow.
 *              A record with `createdAt = endAt` is NOT included (< comparison).
 *
 * Using an exclusive upper bound avoids double-counting rows written exactly
 * at midnight when consecutive windows are stitched together.
 */
export interface WindowBoundaries {
  /** Inclusive lower bound – UTC midnight `days` days before `now`. */
  startAt: Date;
  /** Exclusive upper bound – UTC midnight of tomorrow. */
  endAt: Date;
}

/**
 * Compute UTC-normalized window boundaries for a given number of days.
 *
 * Both boundaries are floored to UTC midnight so that partial-day offsets
 * introduced by `new Date()` mid-execution do not leak into bucket edges.
 *
 * @param days - Number of calendar days in the window (use `TrendingWindow.*`).
 * @param now  - Reference instant; defaults to `new Date()`. Inject in tests.
 */
export function toWindowBoundaries(
  days: number,
  now: Date = new Date(),
): WindowBoundaries {
  // Floor `now` to UTC midnight of today
  const todayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  // Inclusive start: midnight `days` calendar days ago
  const startAt = new Date(todayUTC - days * 24 * 60 * 60 * 1000);

  // Exclusive end: midnight tomorrow
  const endAt = new Date(todayUTC + 24 * 60 * 60 * 1000);

  return { startAt, endAt };
}
