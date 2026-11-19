# Confession Cache Invalidation

Confession reads are cached in Redis through `CacheService`. This page lists
the cache keys, the events that evict them, and how to test a change to either.

## Cache keys

Keys are built in `ConfessionCacheKeys` (`xconfess-backend/src/cache/cache-namespace.ts`).

| Key                  | Contents                                   | TTL                          |
| -------------------- | ------------------------------------------ | ---------------------------- |
| `confession:<uuid>`  | One confession, with view count and reactions | `CACHE_TTL.CONFESSION_SINGLE` (1800s) |
| `confessions:*`      | Public feed pages and tag listings          | `CACHE_TTL.CONFESSION_LIST` (300s)    |

All listings share the `confessions:` prefix, so one pattern delete evicts every
cached page. A confession can appear on any page, so per-page eviction is not
attempted.

## Invalidation events

Every write that changes what a reader can see evicts both the single entry and
the listings. The table below is the complete set.

| Event                                    | Where                                                       |
| ---------------------------------------- | ----------------------------------------------------------- |
| Author edits content (`update`)          | `ConfessionService.update`                                  |
| Admin soft-deletes (`remove`)            | `ConfessionService.remove`                                  |
| Admin restores (`restore`)               | `ConfessionService.restore`                                 |
| Author soft-deletes (`deleteConfession`) | `ConfessionService.deleteConfession`                        |
| Author restores (`restoreConfession`)    | `ConfessionService.restoreConfession`                       |
| Moderator changes status                 | `ConfessionService.updateModerationStatus`                  |
| Moderation webhook result is applied     | `ModerationWebhookController` (after the DB transaction commits) |
| Scheduled confession is published        | `ConfessionSchedulerService` (after the DB transaction commits) |
| New confession is created                | `ConfessionService.publishConfessionCreated` (listings only) |
| Stellar anchor is recorded or verified   | `ConfessionService` (single entry only)                     |

Eviction runs after the database write succeeds. If the write fails, nothing is
evicted and the cached copy remains valid.

## Deletes and status changes

A soft-deleted or hidden confession must not keep appearing from cache. Each of
the events above removes the single entry before the next read, so a deleted
confession returns `404` on its next request even if it was cached a moment
earlier.

## Operational notes

- Eviction is best-effort. `CacheService` logs and swallows Redis errors, so a
  Redis outage can leave a stale entry for at most one TTL.
- Pattern deletes use `KEYS`-style enumeration through the store. They are fine
  at the current feed size. If the keyspace grows, move list keys to a versioned
  namespace instead.
- `CacheService.invalidateSegment` and `delPattern` log only when they remove
  keys, so an empty eviction is silent.

## Testing a change

Cover both halves of the contract in your regression test:

1. Warm the cache (`get` returns the cached value and the database is not hit).
2. Perform the write.
3. Assert `del` was called with `ConfessionCacheKeys.single(id)` and
   `delPattern` with `ConfessionCacheKeys.listPrefix`.

See `confession.service.spec.ts` ("Cache invalidation on confession writes") and
`moderation-webhook.controller.spec.ts` for examples.
