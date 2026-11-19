/**
 * Single source of truth for pagination bounds used across all list endpoints.
 * Import these constants into every pagination DTO and query builder — never
 * hardcode page/limit values anywhere else.
 */
export const PAGINATION = {
  /** Returned when the caller omits the `page` parameter. */
  DEFAULT_PAGE: 1,

  /** Returned when the caller omits the `limit` parameter. */
  DEFAULT_LIMIT: 20,

  /** Absolute minimum items the caller may request per page. */
  MIN_LIMIT: 1,

  /** Hard ceiling — queries larger than this are rejected with 400, not clamped.
   *  Rejecting rather than silently clamping makes the API contract explicit and
   *  prevents clients from accidentally relying on clamping behavior.          */
  MAX_LIMIT: 100,

  /** Pages are 1-indexed throughout the API. */
  MIN_PAGE: 1,

  /**
   * Highest page number any offset-paginated endpoint will accept. Together
   * with MAX_LIMIT this bounds how deep (and therefore how expensive) an
   * offset scan may be: at most MAX_PAGE * MAX_LIMIT rows are ever skipped.
   */
  MAX_PAGE: 1000,
} as const;

/**
 * Canonical validation messages for pagination params. Every list endpoint
 * must use these so `limit`/`page` rejections read identically regardless of
 * which endpoint produced them (Issue #2117).
 */
export const PAGINATION_MESSAGES = {
  PAGE_INTEGER: 'page must be an integer.',
  PAGE_MIN: `page must be at least ${PAGINATION.MIN_PAGE}.`,
  PAGE_MAX: `page must not exceed ${PAGINATION.MAX_PAGE}.`,
  LIMIT_INTEGER: 'limit must be an integer.',
  LIMIT_MIN: `limit must be at least ${PAGINATION.MIN_LIMIT}.`,
  LIMIT_MAX: `limit must not exceed ${PAGINATION.MAX_LIMIT}.`,
} as const;
