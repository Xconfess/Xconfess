# Xconfess GrantFox Implementation Checklist

This checklist tracks implementation against the attached GrantFox readiness brief. Metrics must come from real persisted data only.

## Milestone 1 - Measure Reality

- [x] Create production readiness audit.
- [x] Create implementation checklist.
- [x] Add privacy-safe analytics event model and migration.
- [x] Add server-side analytics ingestion with event and metadata allowlists.
- [x] Add analytics idempotency protection.
- [x] Instrument successful product actions without private content.
- [x] Add public aggregate traction metrics service.
- [x] Add `GET /api/public/traction`.
- [x] Add tests for privacy rejection, idempotency, and public aggregate shape.
- [x] Update safe analytics environment variable examples.
- [x] Run backend lint, focused tests, build, and attempted migration validation.
- [x] Resolve pre-existing unrelated backend suite failures.
- [ ] Run migration validation with configured database environment.

## Milestone 2 - Show Reality

- [x] Add public `/traction` page.
- [x] Add loading, zero, and error states.
- [x] Link traction from navigation/footer and README.
- [x] Document active user definitions and privacy methodology.
- [x] Run frontend typecheck, focused tests, and production build.
- [x] Resolve pre-existing frontend lint failure in `useReadReceipts.ts`.

## Milestone 3 - Strengthen Stellar

- [x] Harden tipping state machine where gaps remain.
- [x] Add transaction reconciliation evidence and tests.
- [x] Add Soroban indexer recovery/metrics if not already complete.
- [x] Add contract deployment registry validation.
- [x] Add aggregate pending/stale tip counts to admin Stellar diagnostics.
- [x] Run focused Stellar/tipping tests, backend build, and backend lint.

## Milestone 4 - Prove Production Quality

- [x] Verify health/readiness endpoints against production requirements.
- [x] Tighten observability and correlation IDs where needed.
- [x] Add production smoke suite command.
- [x] Add focused security regression suite.
- [x] Add production readiness command.
- [x] Run local production readiness command.
- [ ] Resolve live deployed smoke failure: backend liveness timed out after 15000ms.

## Milestone 5 - Prepare For Campaign

- [x] Publish `docs/grantfox-readiness.md`.
- [x] Restructure README top section for product evidence.
- [x] Create only substantive future campaign issues where genuine work remains.

## Privacy Guardrails

- [x] No confession body in analytics.
- [x] No private message body in analytics.
- [x] No email, phone, JWT, auth token, password hash, seed phrase, private key, or raw IP in analytics.
- [x] Public metrics are aggregate-only.
- [ ] Test and internal account exclusions are explicit and documented before use.
