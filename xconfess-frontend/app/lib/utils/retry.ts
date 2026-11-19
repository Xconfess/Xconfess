/**
 * Shared retry policy for read-only API requests (react-query queryFn errors).
 *
 * Retryable: network/timeout failures (no status, or status 0) and 408/429/5xx.
 * Non-retryable: other 4xx client errors (bad request, auth, validation, etc.).
 */
import type { ApiError } from "../api/errors";

const RETRYABLE_STATUSES = new Set([408, 429]);

function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/**
 * Attach ApiError details onto a thrown Error so query hooks and this
 * module can inspect `status`/`code` after react-query's error boundary.
 */
export class QueryError extends Error {
  status?: number;
  code?: string;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = "QueryError";
    this.status = apiError.status;
    this.code = apiError.code;
  }
}

/**
 * Codes the backend returns when an infinite-scroll cursor is stale or
 * malformed (#2311). The frontend treats all of them the same way: stop
 * retrying, surface a refresh path, keep filters.
 */
const PAGINATION_CURSOR_EXPIRED_CODES = new Set([
  "PAGINATION_CURSOR_EXPIRED",
  "BAD_CURSOR",
  "INVALID_CURSOR",
  "PAGINATION_INVALID_PAGE",
]);

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/**
 * True when a failure means the paging cursor is no longer accepted by the
 * server: either an explicit cursor-expired code, or a 400 that looks like
 * a malformed cursor. A 404 is treated as a lost page for the same reason
 * — the next cursor the client would try is already wrong.
 */
export function isPaginationCursorExpired(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code && PAGINATION_CURSOR_EXPIRED_CODES.has(code)) return true;
  const status = getErrorStatus(error);
  if (status === 410) return true;
  if (status === 404) return true;
  if (status === 400 && code && /CURSOR/i.test(code)) return true;
  return false;
}

/**
 * Returns true when a failure is worth retrying: network errors (no status),
 * request timeouts, rate limiting, and server errors. 4xx client errors
 * (other than 408/429) indicate the request itself is invalid and retrying
 * won't help.
 */
export function isRetryableError(error: unknown): boolean {
  // An expired cursor is a permanent-until-we-change-it signal; never retry
  // because the server answer will be the same until the caller resets the
  // cursor — that is #2311's explicit refresh path, not an auto-retry.
  if (isPaginationCursorExpired(error)) return false;

  const status = getErrorStatus(error);

  if (status === undefined) {
    // No HTTP status means the request never completed (offline, DNS
    // failure, timeout) — these are transient and worth retrying.
    return true;
  }
  if (status >= 500) return true;
  if (RETRYABLE_STATUSES.has(status)) return true;
  if (status >= 400 && status < 500) return false;

  return true;
}

const MAX_RETRIES = 3;

/**
 * react-query `retry` option: bounded retries that stop immediately on
 * non-retryable client errors.
 */
export function retryOnTransientError(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  return isRetryableError(error);
}

/**
 * react-query `retryDelay` option: exponential backoff capped at 30s.
 */
export function exponentialBackoff(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
}
