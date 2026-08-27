# Contract Event Version Bump Checklist

> **Wave 5 — Stellar Wave program**  
> Use this checklist whenever you change Soroban event schemas, `event_version` constants, event topics, or compatibility fixtures. It keeps contract, backend parser, and fixture tests aligned so version bumps do not silently break verification.

## Quick links

| Area | Path |
|------|------|
| Event schemas reference | [`docs/event-schemas.md`](./event-schemas.md) |
| Fixture maintenance guide | [`docs/contract-event-compatibility-fixtures.md`](./contract-event-compatibility-fixtures.md) |
| Anchor/tipping runbook | [`docs/stellar-anchor-and-tipping-runbook.md`](./stellar-anchor-and-tipping-runbook.md) |

---

## Contributor checklist

Copy this section into your PR description and check off each item before requesting review.

- [ ] **Contract event sources reviewed** — all touched files listed below are updated consistently.
- [ ] **Contract fixture tests updated** — `backend_verification_fixtures` and related event tests pass locally.
- [ ] **Backend fixture tests updated** — stellar and tipping fixture specs match new shapes/versions.
- [ ] **Changelog / compatibility note added** — see [Required changelog or compatibility note](#required-changelog-or-compatibility-note).
- [ ] **`event_version` vs `FIXTURE_VERSION` decision documented** — see [When to increment versions](#when-to-increment-versions).

---

## Contract event source files

Review and update every file that defines or emits versioned events:

| File | Scope |
|------|--------|
| [`xconfess-contracts/contracts/events.rs`](../xconfess-contracts/contracts/events.rs) | Shared confession/reaction/report/role events, `EVENT_VERSION_V1`, `VersionedEvent` |
| [`xconfess-contracts/contracts/governance/events.rs`](../xconfess-contracts/contracts/governance/events.rs) | Governance proposal/approval/execution events |
| [`xconfess-contracts/contracts/emergency_pause/events.rs`](../xconfess-contracts/contracts/emergency_pause/events.rs) | Pause/unpause events |
| [`xconfess-contracts/contracts/configurable/events.rs`](../xconfess-contracts/contracts/configurable/events.rs) | Config change events |
| [`xconfess-contracts/contracts/confession-anchor/src/events.rs`](../xconfess-contracts/contracts/confession-anchor/src/events.rs) | `EVENT_SCHEMA_VERSION`, anchor and version-check events |

Also check inline event structs in modules that emit events directly (for example `report.rs`, `reputation-badges`) when your change is not confined to the files above.

---

## Contract fixture and event tests

Run and update these tests when event shape or version constants change:

| Test file | Purpose |
|-----------|---------|
| [`xconfess-contracts/contracts/tests/backend_verification_fixtures.rs`](../xconfess-contracts/contracts/tests/backend_verification_fixtures.rs) | Canonical anchor/tip/error fixtures; defines `FIXTURE_VERSION` |
| [`xconfess-contracts/contracts/tests/event_decoder_compat.test.rs`](../xconfess-contracts/contracts/tests/event_decoder_compat.test.rs) | Version markers and schema drift guards |
| [`xconfess-contracts/contracts/tests/event_nonce_ordering.test.rs`](../xconfess-contracts/contracts/tests/event_nonce_ordering.test.rs) | Nonce ordering for versioned events |
| [`xconfess-contracts/contracts/tests/correlation_events_tests.rs`](../xconfess-contracts/contracts/tests/correlation_events_tests.rs) | Correlation ID emission |

```bash
cd xconfess-contracts
cargo test --test backend_verification_fixtures
cargo test --test event_decoder_compat
cargo test --test event_nonce_ordering
cargo test --test correlation_events_tests
```

---

## Backend fixture tests

Update backend parsers and these specs in the **same PR** as contract event changes (or document why backend is intentionally deferred):

| Test file | Purpose |
|-----------|---------|
| [`xconfess-backend/src/stellar/__tests__/contract-event-fixtures.spec.ts`](../xconfess-backend/src/stellar/__tests__/contract-event-fixtures.spec.ts) | Anchor event parsing, error classification, `fixture_version` / `event_version` stability |
| [`xconfess-backend/src/tipping/contract-fixtures.spec.ts`](../xconfess-backend/src/tipping/contract-fixtures.spec.ts) | Tip settlement fixtures and version compatibility |
| [`xconfess-backend/src/stellar/event-parser/contract-event-parser.spec.ts`](../xconfess-backend/src/stellar/event-parser/contract-event-parser.spec.ts) | Versioned compatibility-layer registry: fixture coverage for every public event category, fixture/registry parity, typed error classification |
| [`xconfess-backend/src/stellar/event-parser/contract-event-parser.doc-parity.spec.ts`](../xconfess-backend/src/stellar/event-parser/contract-event-parser.doc-parity.spec.ts) | Contract/backend parity — parses this doc's fixture table and diffs it against the compatibility-layer registry |

```bash
cd xconfess-backend
npm test -- contract-event-fixtures.spec.ts
npm test -- contract-fixtures.spec.ts
npx jest --config jest.config.js src/stellar/event-parser
```

See [`docs/contract-event-parser-compatibility.md`](./contract-event-parser-compatibility.md) for the full compatibility-layer checklist and matrix.

---

## When to increment versions

Two separate version concepts apply. Do not conflate them.

### `event_version` (on-chain schema)

Increment the per-event or global `event_version` / `EVENT_VERSION_V*` / `EVENT_SCHEMA_VERSION` when:

- A field is **added, removed, reordered, or retyped** in the emitted event payload.
- The Soroban **topic** string or `#[contractevent]` layout changes in a way indexers or the backend cannot parse with the old decoder.
- Nonce, timestamp, or correlation semantics change in a way that affects ordering or verification.

**Do not** increment for comment-only or internal refactors that do not change emitted ledger data.

### `FIXTURE_VERSION` (test-vector compatibility)

Increment `FIXTURE_VERSION` in [`backend_verification_fixtures.rs`](../xconfess-contracts/contracts/tests/backend_verification_fixtures.rs) and matching `fixture_version` fields in backend specs when:

- Fixture **payload structure** or constant values change incompatibly (backend tests would fail without updating mocks).
- **Error code → HTTP/retry classification** mappings change.
- A **new fixture category** is added that existing backend tests must recognize.

**Do not** increment `FIXTURE_VERSION` when:

- Only `event_version` increases but fixtures are regenerated with the same logical fields and backend parsers already handle both versions.
- You fix test descriptions or comments without changing serialized event bytes or fixture constants.

When `FIXTURE_VERSION` increments, backend services that read historical events may need **dual-version parsing** until old ledger events are fully processed. Note that in your compatibility entry.

---

## Required changelog or compatibility note

Every event version bump **must** include a short compatibility note in one of these places (prefer both for breaking changes):

1. **[`docs/event-schemas.md` — Version History](./event-schemas.md#version-history)** — add a row with version, date, and summary of breaking vs additive changes.
2. **PR description** — use this template:

```markdown
### Event compatibility (required for version bumps)

- **Contracts:** <files changed>
- **event_version:** <old> → <new> (or unchanged)
- **FIXTURE_VERSION:** <old> → <new> (or unchanged)
- **Breaking:** yes | no
- **Backend impact:** <parser files / migration / none>
- **Indexer impact:** <topic or field changes>
- **Rollback:** <how to revert safely, or N/A>
```

For **breaking** changes, also add a subsection under [Backward Compatibility](./event-schemas.md#backward-compatibility) in `event-schemas.md` describing dual-read support and sunset timeline.

---

## Validation commands

```bash
# Contract
cd xconfess-contracts && cargo test --test backend_verification_fixtures

# Backend
cd xconfess-backend && npm test -- contract-event-fixtures.spec.ts contract-fixtures.spec.ts
```

CI must pass on both sides before merge. Fixture drift usually means `event_version` or `FIXTURE_VERSION` was bumped without updating the paired test file listed above.

---

## Related issues and docs

- Maintainer context: [`maintainer/issues/223-fix-contracts-add-backend-verification-compatibility-fixtures.md`](../maintainer/issues/223-fix-contracts-add-backend-verification-compatibility-fixtures.md)
- Operational runbook: [`docs/stellar-anchor-and-tipping-runbook.md`](./stellar-anchor-and-tipping-runbook.md)
