# Database readiness checks and search query normalization

This page covers three behaviour changes and the checks that guard them:

1. Search queries are normalized differently (API behaviour change).
2. Migration ordering is checked in tests (`src/database/migration-ordering.spec.ts`).
3. Entities can be compared with the live schema (`checkEntityColumnCompatibility`).

## Search query normalization

`GET /api/confessions/search` and the full-text search endpoint both use one
normalizer, `src/confession/search-query-normalizer.ts`. It runs before the
full-text query and does four things:

- Folds Unicode compatibility forms (NFKC): full-width `ＡＢＣ` becomes `ABC`,
  and the `ﬁ` ligature becomes `fi`.
- Turns whitespace and control characters into a single space.
- Turns punctuation and symbols into a space, so `!!!love???` searches for `love`.
- Keeps letters, digits and combining marks from every script.

### What changed for callers

| Input | Before | After |
|---|---|---|
| `Café` | searched as `Caf` (accent dropped) | searched as `Café` |
| `東京 タワー` | full-text ignored the CJK characters, so results came only from the `ILIKE` fallback | searched as `東京 タワー` in full-text |
| `नमस्ते` | rejected with 400 (vowel signs not allowed) | accepted and searched |
| `!!!love???` | `love` | `love` (unchanged) |
| `   ` | 400 `Search term cannot be empty` | 400 `Search term cannot be empty` (unchanged) |

The DTO still rejects markup and other characters outside letters, numbers,
combining marks, spaces and the listed punctuation. `<script>` is still a 400.

## Migration ordering checks

`src/database/migration-ordering.spec.ts` runs without a database. It checks
every file in `migrations/` and `src/migrations/` with
`MigrationVerificationService.verifyMigrations()`.

TypeORM orders migrations by the 13-digit timestamp at the end of each class
name. The current repository has these known issues, which the spec pins so
that no new one is added silently:

- `Duplicate migration timestamp: 0260927000001`
- `Duplicate migration timestamp: 0261016000001`
- `Duplicate migration name: create-confession-idempotency-records`

These are left unchanged on purpose. Renaming a migration changes the name
recorded in the `migrations` table, so TypeORM would run it again on any
database that already applied it. When one of these is fixed deliberately,
remove it from `KNOWN_MIGRATION_ISSUES` in the spec.

Migrations in this repository assume the base tables (`user`, `comments`,
`anonymous_confessions`) already exist. They are created by TypeORM
`synchronize`, not by a migration. A migrate-from-empty test therefore needs
a base schema first, and is not part of this check.

## Entity and schema compatibility

`MigrationVerificationService.checkEntityColumnCompatibility()` compares
every entity table and column with the `public` schema in
`information_schema.columns`. It reports:

- `missingTables`: an entity whose table does not exist.
- `missingColumns`: `table.column` declared on an entity but absent in the database.
- `nullabilityMismatches`: `table.column` where NULL and NOT NULL disagree,
  with both sides named, for example `users.email (entity NOT NULL, database NULL)`.

The method returns `queryError` instead of throwing, the same as the other
checks. It is not called at application startup, so a drifted schema does not
block boot. Call it from a script or test when you need the check.

Column types are not compared yet, only presence and nullability.
