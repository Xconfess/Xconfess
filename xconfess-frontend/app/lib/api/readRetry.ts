import { getErrorStatusCode, isNetworkError } from "@/app/lib/utils/errorHandler";

/**
 * Retry policy for read-only queries (feed, confession detail).
 *
 * - Retries transient failures only: network loss, timeouts (408), rate
 *   limiting (429) and 5xx responses.
 * - Never retries other 4xx client errors, "NOT_FOUND", or cancelled requests.
 * - Bounded: at most `MAX_READ_RETRIES` retries with capped exponential backoff.
 *
 * While the browser is offline React Query pauses these retries and resumes
 * on reconnect, keeping the last successful data on screen in the meantime.
 */
export const MAX_READ_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

export function isRetryableReadError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof Error && error.message === "NOT_FOUND") return false;
  if (error instanceof Error && error.message === "NETWORK_FAILURE") return true;
  if (error instanceof TypeError) return true; // fetch() network failure
  if (isNetworkError(error)) return true;

  const status = getErrorStatusCode(error);
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

export function shouldRetryRead(failureCount: number, error: Error): boolean {
  return failureCount < MAX_READ_RETRIES && isRetryableReadError(error);
}

export function readRetryDelay(attemptIndex: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attemptIndex, MAX_DELAY_MS);
}
