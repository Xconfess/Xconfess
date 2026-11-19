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
 * Returns true when a failure is worth retrying: network errors (no status),
 * request timeouts, rate limiting, and server errors. 4xx client errors
 * (other than 408/429) indicate the request itself is invalid and retrying
 * won't help.
 */
export function isRetryableError(error: unknown): boolean {
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
