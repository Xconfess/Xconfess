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
} as const;
