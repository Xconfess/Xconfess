# Pull Request: feat(backend): implement anonymous-only confession search filter

## Summary
Implements the `anonymousOnly` search filter for confessions, allowing users to restrict search results to content posted by unauthenticated guest users (no linked registered account).

## Changes Made
- **DTO**: Updated `SearchConfessionDto` to implement and document the `anonymousOnly` flag.
- **Repository**: Enhanced `AnonymousConfessionRepository.hybridSearch` and `fullTextSearch` with:
  - `LEFT JOIN` on `userLinks` to filter for truly anonymous confessions.
  - Added standard safety filters for `isDeleted`, `isHidden`, and `moderationStatus` to ensure search consistency and security.
- **Service**: Updated `ConfessionService` to correctly propagate the full search DTO to the repository methods.
- **Tests**: Added unit tests to `confession.search.spec.ts` to verify the service-to-repository flag propagation.

## Verification
- Cross-referenced entity relations (`confession -> anonymousUser -> userLinks`) to ensure accurate join logic.
- Verified Postgres-specific query builder patterns for the PostgreSQL full-text search backend.
- Added test coverage for the new filter across all search types.

Closes #521
