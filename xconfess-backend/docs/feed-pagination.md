# Feed pagination

All cursor responses use `{ data, nextCursor, hasMore, hasNextPage, limit }`.
`hasNextPage` is an alias of `hasMore`; a terminal page has both false and a
null `nextCursor`. Queries fetch one extra row when possible to determine
whether another page exists. The shared limit range is 1 to 100; the default is
20 unless an endpoint documents a different default. Cursors are opaque to
clients: return the exact `nextCursor` with the same filters and sort options.
Changing filters or sort order while continuing a cursor is unsupported.

## Supported feeds

| Endpoint | Sort and order | Cursor boundary |
| --- | --- | --- |
| `GET /api/confessions` | `newest` (default), `trending`, `most_discussed`. Newest is `created_at DESC, id DESC`; aggregate sorts are score descending, then `created_at DESC, id DESC`. | Newest uses `(created_at, id)` keyset pagination. Aggregate sorts carry an offset because their scores are computed; these pages can move when reactions, comments, or records change. |
| `GET /api/users/:userId/confessions` | Same three sort values as the public feed. | Same keyset/offset rules as the public feed. |
| `GET /api/confessions/tags/:tag` | Newest first: `created_at DESC, id DESC`. | `(created_at, id)` keyset pagination. The current tag implementation always uses newest order. |
| `GET /api/confessions/:confessionId/comments` | `sortField=createdAt` (default) or `id`; `sortOrder=DESC` (default) or `ASC`. | Strict `(createdAt, id)` boundary for created-time sorting; strict `id` boundary for ID sorting. |
| `GET /api/messages/thread/:threadId` | Oldest first: `createdAt ASC, id ASC`. | Strict `(createdAt, id)` boundary. |
| `GET /api/messages/:userId/inbox` | Threads are ordered by each thread's latest message time, newest first. | The cursor is a continuation marker, not a snapshot. It uses message timestamps while threads are grouped in memory; equal-time concurrent changes can move thread boundaries. |
| `GET /api/admin/reports` | `createdAt DESC, id DESC`, with optional status, type, and date filters. | Strict `(createdAt, id)` boundary. Keep all filters unchanged. |
| `GET /api/admin/users/search` | `createdAt DESC, id DESC`, filtered by the search query. | Strict `(createdAt, id)` boundary. Keep the query unchanged. |

The unique ID tie-breaker prevents duplicate/omitted rows when timestamps
match on keyset feeds. Cursors are not snapshots. New or updated records can
appear, move, or be absent between requests; restart pagination to obtain a
fresh traversal. Aggregate-sort and inbox cursors are especially sensitive to
concurrent changes because their sort position is computed or grouped.

## Deleted records

Deleted or hidden confessions are excluded from public and tag feeds. A
confession deleted after a cursor was issued is therefore absent from later
pages; its cursor value remains usable because keyset continuation compares
the encoded position and does not look up the original row. Deleted comments
remain as `[deleted]` placeholders to preserve reply context. Replies whose
parent comment is deleted are omitted by default; callers can opt in with
`includeOrphanedReplies=true`. Message records removed from a user's view are
not returned. Deletions between page requests can shorten a page but do not
change the meaning of an already-issued keyset boundary.

Legacy `?page=` offset requests on the confession, comment, and message-thread
endpoints emit `Deprecation`, `Sunset`, and `Link` headers; see
`docs/API_INTEGRATION.md` (Deprecation headers). Offset pagination can shift
when records are inserted or deleted ahead of the requested offset.