# Feed: pagination cursor recovery

The infinite confession feed hook now recovers cleanly from a
server-side cursor that has expired, been rotated, or is otherwise no
longer acceptable (#2311) — instead of retrying indefinitely until it
exhausts backoff.

## Detection

`isPaginationCursorExpired(error)` in
`xconfess-frontend/app/lib/utils/retry.ts` matches any of:

- Explicit backend codes `PAGINATION_CURSOR_EXPIRED`, `BAD_CURSOR`,
  `INVALID_CURSOR`, `PAGINATION_INVALID_PAGE`.
- HTTP `410 Gone` and `404 Not Found` on a paginated endpoint.
- HTTP `400` with any error code matching `/CURSOR/i`.

Anything else continues through the normal retry classification
(network errors + 408/429/5xx retry, other 4xx do not).

## Hook surface

`useInfiniteConfessions(...)` returns the usual react-query payload plus:

- `cursorExpired: boolean` — set when the queryFn receives an
  `isPaginationCursorExpired` error. Stays `true` until the caller
  invokes `recoverCursor` (or unmounts).
- `recoverCursor(): Promise<void>` — resets the state flag, removes the
  cached pages for this query, and refetches from page 1. Filters stay
  in place because they are part of the query key; nothing in the
  filter state is touched.

## Retry policy

`retryOnTransientError` now refuses to retry an expired cursor — the
answer would be the same until a different cursor is sent, so a retry
loop would just burn battery and rate limits. The hook's `retry` option
layers the same guard in case callers override it.

## Caller pattern

```tsx
const feed = useInfiniteConfessions(params);

if (feed.cursorExpired) {
  return (
    <FeedCursorExpiredBanner onRefresh={feed.recoverCursor} />
  );
}
```

The banner belongs to the feed view that owns the layout; the hook is
UI-agnostic.

## Failure safety

- No infinite retry loop: the hook opts out of retries for cursor-expired
  errors at both the `retry` and the `isRetryableError` layer.
- Filters survive the reset: `recoverCursor` only removes the exact
  infinite-query cache entry, so sort, search text and tab stay in the
  URL / state the user chose.
- The recovery call never silently re-paginates; it goes through
  `refetch()` so react-query's normal error surface still applies if the
  fresh request also fails.

## Files

- `xconfess-frontend/app/lib/hooks/useConfessionsQuery.ts`
- `xconfess-frontend/app/lib/utils/retry.ts`
- `xconfess-frontend/app/lib/utils/__tests__/retry.test.ts` — new
  `isPaginationCursorExpired (#2311)` describe block covers explicit
  codes, 410/404 fallbacks, the 400+cursor-code heuristic, non-matching
  errors, and the retry-off refusal.
