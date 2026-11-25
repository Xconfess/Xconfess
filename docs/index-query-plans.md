# Index Query-Plan Validation

This note documents how to validate — before and after a migration — that the
indexes added for notification retrieval (#1986) and anonymous message
conversation lookups (#1987) are actually used by PostgreSQL. It complements the
deterministic rollback tests in
`xconfess-backend/src/database/index-migration-rollback.spec.ts`.

Run every statement below from `psql` against a database where the migrations
have been applied (`npm run backend:migration:run`). Use
`EXPLAIN (ANALYZE, BUFFERS)` so the planner reports actual row counts, buffer
usage, and whether it chose an `Index Scan` / `Bitmap Index Scan` or a
`Seq Scan`.

## 1. Capture the "before" plan

Before applying a migration, run the relevant statement and note a `Seq Scan`
on the target table. Then apply the migration and run it again.

```bash
# backend workspace
npm run migration:run      # applies pending migrations
npm run migration:show     # confirms the new migration is applied
```

To roll back and re-measure:

```bash
npx typeorm-ts-node-commonjs -d data-source.ts migration:revert
```

## 2. Notification indexes (#1986)

| Query pattern | Expected index |
|---------------|----------------|
| Recipient feed ordered by time | `idx_notifications_recipient_created` |
| Unread-only feed / badge count / mark-all-read | `idx_notifications_recipient_unread` |
| Message-batching window (type + unread + time) | `idx_notifications_recipient_type_unread` |

```sql
-- Recipient feed, all read states
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "notifications"
WHERE "userId" = '00000000-0000-0000-0000-000000000000'
ORDER BY "createdAt" DESC
LIMIT 20;

-- Unread badge count / mark-all-read
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM "notifications"
WHERE "userId" = '00000000-0000-0000-0000-000000000000' AND "isRead" = false;

-- Message batching window
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "notifications"
WHERE "userId" = '00000000-0000-0000-0000-000000000000'
  AND "type" = 'new_message'
  AND "isRead" = false
  AND "createdAt" > now() - interval '5 minutes'
ORDER BY "createdAt" DESC;
```

The plans should reference the index names above rather than `Seq Scan on
"notifications"`. If a `Seq Scan` remains because the table is tiny, re-run with
`SET enable_seqscan = off;` to confirm the index is usable, or seed enough rows
to make the index cheaper than a scan.

## 3. Anonymous message conversation indexes (#1987)

| Query pattern | Expected index |
|---------------|----------------|
| Thread history: `confessionId` + `senderId`, ordered by time | `idx_messages_thread_history` |
| All threads for a sender, newest first | `idx_messages_sender_history` |
| Conversation membership resolution via confession owner | `idx_anonymous_confessions_anonymous_user_id` |

```sql
-- Thread history (message history for one conversation)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "messages"
WHERE "confessionId" = 1 AND "senderId" = 1
ORDER BY "createdAt" ASC
LIMIT 21;

-- All threads involving one sender
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "messages"
WHERE "senderId" = 1
ORDER BY "createdAt" DESC
LIMIT 200;

-- Conversation membership / authorization lookup
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "anonymous_confessions"
WHERE "anonymous_user_id" = '00000000-0000-0000-0000-000000000000';
```

## 4. Confirm rollback removes the indexes

After `migration:revert`, the indexes should no longer exist:

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_notifications_recipient_created',
    'idx_notifications_recipient_unread',
    'idx_notifications_recipient_type_unread',
    'idx_messages_thread_history',
    'idx_messages_sender_history',
    'idx_anonymous_confessions_anonymous_user_id'
  );
-- expected: zero rows
```

Re-running `migration:run` should recreate them; the rollback tests exercise the
same `up`/`down` statements against an in-memory query runner so regressions are
caught without a live database.
