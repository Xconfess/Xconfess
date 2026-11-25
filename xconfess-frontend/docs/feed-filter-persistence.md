# Feed: filter persistence across tabs and routes

The confession feed preserves the user's most recent sort selection so that
switching between the sort tabs, navigating away to a detail page, or
landing on a sibling feed surface (e.g. the preview on `/` and the full
feed at `/confessions`) all resume on the tab the user last chose.

## Which filters persist

| Filter | Allowed values | Scope of persistence |
| --- | --- | --- |
| `sort` | `newest`, `trending`, `most_discussed` | Per browser tab, via `sessionStorage`. Cleared when the tab closes. |

Only values in the allow-list above are read or written. A persisted value
that is not in the list (for example, left behind by an older build that
had a `hot` tab) is treated as absent — the feed falls back to its
component-level default (`initialSort`). This keeps the UI immune to an
invalid filter combination being requested from the backend.

## Priority order

For every full (non-preview) feed render, the selected sort is resolved in
this order:

1. **URL query parameter** (`?sort=...`) — wins if present and valid. This
   keeps shareable links and back/forward navigation deterministic.
2. **Persisted session value** — read from `sessionStorage` under the
   `xconfess.feed.filters` key.
3. **`initialSort` prop** — the per-page default the component is mounted
   with (e.g. `trending` on the home preview, `newest` elsewhere).

Any time the resolved sort changes, the session store is updated so the
next feed render in the same tab stays in sync. Preview feeds (`preview`
prop) are pinned to `initialSort` and never read or write the store.

## Why sessionStorage, not localStorage or a cookie

- Cross-tab leakage is not wanted: each browser tab should be free to
  browse a different sort without the others jumping. `sessionStorage` is
  per-tab by design.
- A cookie would be sent on every request; this is a pure client
  preference and the server does not need to know it.
- A failing write (private mode, quota, disabled storage) is swallowed —
  the URL remains the source of truth, so the user still sees the right
  content; they just lose the convenience of the last-chosen tab carrying
  over between routes.

## API

The small shared hook `app/lib/hooks/useFeedFilterPersistence.ts`:

```ts
const { read, write, clear } = useFeedFilterPersistence<FeedSort>(
  "sort",
  SORT_OPTIONS.map((o) => o.value),
);
```

- `read()` returns the persisted value if it is one of the `allowedValues`,
  otherwise `null`.
- `write(value)` persists an allowed value; invalid values are dropped.
- `clear()` removes just that filter's entry.

Both the key (`"sort"`) and the allow-list are checked on every read and
write, so an invalid combination can never slip through.

## Automated verification

- `app/lib/hooks/__tests__/useFeedFilterPersistence.test.ts` covers:
  default `null`, round-trip read/write, rejection of invalid values,
  rejection of persisted values no longer in the allow-list, rejection of
  non-object storage, unknown-key refusal, `clear()`, and a `setItem` that
  throws (quota / private mode) being swallowed.
