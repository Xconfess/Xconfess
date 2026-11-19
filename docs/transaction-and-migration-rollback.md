# Transaction and Migration Rollback Guarantees

This page covers two questions: what is guaranteed to roll back when a
multi-step database operation fails, and which schema migrations can be
reverted safely. The tests named here are the executable form of these claims.

## Transactions

A failed step must leave no earlier write behind. Every multi-step write runs in
one `DataSource.transaction` (or `manager.transaction`), and any thrown error
rolls back the whole callback. Side effects that leave the database (events,
cache eviction, notifications) run only after commit.

| Operation                         | Steps inside the transaction                                   | Covered by                                                                 |
| --------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Confession creation               | Anonymous user, confession, tags, moderation log                | `confession-side-effects.postgres.spec.ts` (PostgreSQL, CI only). It simulates these tables and does not call `ConfessionService.create`, so the service itself has no rollback test yet. |
| Reaction creation                 | Duplicate check, reaction insert, outbox event                  | `reaction.service.spec.ts` ("rolls back the reaction ... outbox write fails") |
| Moderation state transition       | Locked read, state change, audit entry                          | `transaction-rollback.spec.ts` ("restores the previous status ...")          |
| Moderation webhook result         | Moderation log sync, confession update                          | `transaction-rollback.spec.ts`, `moderation-webhook.controller.spec.ts`      |

### Behaviour that differs from a plain rollback

- **Reaction unique race.** A concurrent duplicate reaction violates
  `uq_reaction_confession_user`. The insert runs under a savepoint so only that
  statement is undone, and the winning row is returned. Other errors still roll
  back the whole transaction.
- **Audit writes.** `AuditLogService.log()` catches and logs its own write
  errors so that an audit outage does not block moderation. A failed audit write
  therefore does not roll back the state change. Only an error that escapes the
  audit call rolls it back.
- **Redelivered webhooks.** A webhook whose transaction rolled back is not
  recorded as delivered. The next delivery with the same hash is applied, not
  treated as a duplicate.

### Running the PostgreSQL-backed checks

Specs named `*.postgres.spec.ts` run only when `CI=true` and `DB_HOST` is set.
Local runs skip them. They use temporary tables, so they can run against a
shared development database.

## Migrations

Migrations are grouped by what `down` can restore.

- **Reversible, no data loss.** `down` restores the previous schema and no rows
  are removed.
- **Reversible, data loss.** `down` restores the schema, but the rows the
  migration created are removed.
- **Not reversible.** `down` is a no-op because the previous values cannot be
  reconstructed.

| Migration                                         | Class                | What `down` does                                  | Data-loss caveat and recovery                                                                                 |
| ------------------------------------------------- | -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `20260721000001-create-confession-idempotency-records` | Reversible, data loss | Drops the FK, indexes, then the table             | All idempotency records are deleted. Retries of recent keys stop being deduplicated until the table is recreated and traffic refills it. Recovery: re-run `up`. |
| `20260723000001-add-audit-report-composite-indexes` | Reversible           | Drops the five composite indexes                  | No data loss. Admin audit and report filters become slower until `up` is re-run.                              |
| `20260725000001-backfill-default-key-version`     | Not reversible       | No-op                                             | Rows that had `key_version = NULL` keep `'v1'` after rollback. `'v1'` is a valid value, so this is intended. Recovery: none needed; restore from backup only if NULLs must return. |
| `20260725000002-add-unique-idempotency-key-to-tips` | Reversible           | Replaces the partial unique index with a plain index | No data loss. **Rolling back removes the double-credit guard**, so do not roll back while tip verification is live. |
| `20260725000003-add-unique-reaction-constraint`   | Reversible           | Drops the unique index                             | No data loss. `up` fails if duplicate `(confession_id, anonymous_user_id)` rows exist. Find them with the query below, delete the extras, then re-run `up`. |

Duplicate reactions that block `20260725000003`:

```sql
SELECT confession_id, anonymous_user_id, COUNT(*)
FROM reaction
GROUP BY confession_id, anonymous_user_id
HAVING COUNT(*) > 1;
```

### Tests

`src/database/recent-migration-rollback.spec.ts` runs `up` and `down` for each
migration above against a recording query runner. It checks:

- the exact DDL issued, and that `down` drops dependents before their parents;
- that guarded migrations do nothing when their table is absent;
- that the backfill's `down` issues no SQL.

These tests check the generated SQL. They do not prove the database accepts it.
The PostgreSQL migration checks (`migration-verification.postgres.spec.ts`) cover
that.

### Before shipping a schema change

1. Classify it using the table above, and add it to the table in the same PR.
2. Add a row to the rollback spec for each new migration.
3. If the `down` is a no-op or drops rows, say so in the PR body with the
   recovery steps.
4. Confirm `npm run backend:migration:show` lists the migration with no
   class-name errors (see the [Contributor Guide](CONTRIBUTOR_GUIDE.md#database-migrations)).
