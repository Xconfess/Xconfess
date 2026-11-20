# Privacy boundaries for fixtures, deleted replies, and profile responses

## Fixture policy (#2297)

Committed synthetic fixtures are validated by `npm run fixtures:validate` and
`npm run fixtures:test`. The CI secret-scan job runs both checks. Use
`scripts/fixtures/synthetic-identities.json` for documented dummy identities,
addresses, and tokens. Never add production secrets or real personal information
to fixtures. Validation findings must not print complete credential values.

## Deleted comment replies (#2298)

The public comments endpoint preserves a deleted comment as a `[deleted]`
placeholder, but hides its retained reply subtree. Deleted comments have
mention and anonymous-context metadata removed from the response. The legacy
`includeOrphanedReplies` query parameter does not override this privacy rule.
Deletion is not a hard-delete of database records; it prevents the public
comments response from exposing deleted-thread context.

## Identity-scoped profiles (#2295)

Frontend profile, profile-summary, privacy-settings and authenticated public-
profile proxies use `cache: 'no-store'` for upstream fetches and return
`Cache-Control: private, no-store, max-age=0` and
`Vary: Cookie, Authorization`. Responses must not be placed into a shared
cache keyed only by URL. Do not cache authenticated profile responses across
sessions; changes to identity or privacy settings must be fetched afresh.
