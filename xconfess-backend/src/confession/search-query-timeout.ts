/** PostgreSQL SQLSTATE raised when a statement is cancelled by statement_timeout. */
const QUERY_CANCELED_SQLSTATE = '57014';

/** Used when SEARCH_QUERY_TIMEOUT_MS is missing or not a number. */
export const DEFAULT_SEARCH_QUERY_TIMEOUT_MS = 5000;

/** Generic client-facing message. It never echoes the search term. */
export const SEARCH_TIMEOUT_MESSAGE =
  'Search took too long to complete. Please try a narrower search.';

/**
 * True when a database error means a search was cancelled by its statement
 * timeout. TypeORM's QueryFailedError copies the driver fields onto itself,
 * but the driverError is checked too in case a wrapper keeps only that.
 */
export function isSearchQueryTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const candidate = err as {
    code?: unknown;
    message?: unknown;
    driverError?: { code?: unknown; message?: unknown };
  };
  const code = candidate.code ?? candidate.driverError?.code;
  const message = candidate.message ?? candidate.driverError?.message;

  return (
    code === QUERY_CANCELED_SQLSTATE ||
    (typeof message === 'string' && /statement timeout/i.test(message))
  );
}
