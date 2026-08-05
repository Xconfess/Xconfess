# Contract Event Compatibility Fixture Documentation

> **Changing `event_version` or fixtures?** Follow the step-by-step checklist in [`contract-event-version-bump-checklist.md`](./contract-event-version-bump-checklist.md) (required for Wave 5 event changes).

## Overview
Contract event fixtures are essential for verifying that the Soroban contract events can be successfully parsed and processed by downstream consumers, such as the backend services.

## Fixture Maintenance Guide

### Current Fixture Registry
The canonical public event fixture registry is `PUBLIC_EVENT_SCHEMA_FIXTURES`
in `xconfess-contracts/contracts/events.rs`. It records the fixture version,
event version, event topic, data format, and exact field order that downstream
decoders rely on.

`EVENT_FIXTURE_VERSION_V1` is the current fixture registry version. All public
event fixtures currently use `event_version = 1`.

### V1 Public Event Fixtures

| Category | Event | Topic | Data format | Event version |
|---|---|---|---|---|
| Anchor | `ConfessionAnchoredEvent` | `confession_anchor` | `vec` | 1 |
| Anchor | `VersionCompatibilityCheckedEvent` | `version_compatibility_checked` | `vec` | 1 |
| Tip | `SettlementEvent` | `tip_settl` | `single-value` | 1 |
| Confession | `ConfessionEvent` | `confess` | `single-value` | 1 |
| Reaction | `ReactionEvent` | `react` | `single-value` | 1 |
| Pause | `PauseChangedEvent` | `tip_pause` | `single-value` | 1 |
| Report | `ReportEvent` | `report` | `single-value` | 1 |
| Report | `ReportSubmittedLedgerEvent` | `report` | `single-value` | 1 |
| Role | `RoleEvent` | `role` | `single-value` | 1 |
| Governance | `GovernanceEvent` | `<stream>` | `single-value` | 1 |
| Governance | `GovernanceProposedEvent` | `gov_prop` | `single-value` | 1 |
| Governance | `GovernanceApprovedEvent` | `gov_app` | `single-value` | 1 |
| Governance | `GovernanceApprovalRevokedEvent` | `gov_rev` | `single-value` | 1 |
| Governance | `GovernanceExecutedEvent` | `gov_exec` | `single-value` | 1 |
| Governance | `GovInvariantViolationEvent` | `gov_inv` | `single-value` | 1 |
| Reputation | `BadgeEvent` | `badge` | `single-value` | 1 |
| Reputation | `BadgeEvent` | `badge_awarded` | `single-value` | 1 |
| Reputation | `BadgeEvent` | `badge_granted` | `single-value` | 1 |
| Reputation | `BadgeEvent` | `badge_revoked` | `single-value` | 1 |
| Reputation | `ReputationAdjustedData` | `reputation_adjusted` | `single-value` | 1 |
| Reputation | `ReputationDecayedData` | `reputation_decayed` | `single-value` | 1 |

### Where Event Fixtures Originate
Fixtures are generated directly from the Soroban contract test suites or the
typed public registry. During testing, specific contract invocations emit
events, which are captured and compared with the expected topic and payload
shape. The registry protects lightweight schema fixtures for public events even
when the event is emitted from a specialized contract crate.

### How Fixture Snapshots are Generated
When a contract is modified to change its event schema, the fixture registry
and any emitted-event fixture tests must be regenerated or updated to reflect
these changes. This is typically done by running the contract test suite with
an environment variable flag to overwrite existing snapshots.

```bash
# Example: updating snapshots
UPDATE_SNAPSHOTS=1 cargo test --workspace
```

### How Backend Compatibility Tests Consume Fixtures
The backend services (`xconfess-backend`) consume these fixtures within their own test suites. By loading the fixtures, the backend verifies that its parsers can successfully decode and interpret the event data structures emitted by the contract.

The backend Stellar fixture spec consumes the V1 `ReportEvent` fixture shape
and verifies that every field in the registered order is present before a
decoder accepts the event.

## Version Bump Rules

Increment `event_version` when any backend-visible event topic, data format, or
payload field order changes, or when a field is added, removed, renamed, or
retyped.

Increment `EVENT_FIXTURE_VERSION_V1` by introducing the next fixture version
constant when fixture coverage changes in a way backend tests must explicitly
recognize, such as adding a public event category or changing canonical
example values. Pure documentation edits do not require a fixture version bump.

Every version bump must update:

1. `xconfess-contracts/contracts/events.rs`
2. `xconfess-contracts/contracts/tests/event_decoder_compat.test.rs`
3. Backend fixture decoder tests that consume the changed fixture category
4. This document and `docs/event-schemas.md` version history

## Event Shape Review Workflow

### Schema Changes
Any change to a Soroban event schema (e.g., adding a field, changing a type) must be reviewed carefully.
1. Update the contract code and tests.
2. Regenerate the fixtures.
3. Update the backend parsers to handle the new shape.
4. Verify backend compatibility validation suites pass.

### Compatibility Validation
The backend Stellar event tests rely on these fixtures. If the backend fails to parse the new fixtures, the contract changes cannot be safely deployed without accompanying backend updates.

## References
* **[Event version bump checklist](./contract-event-version-bump-checklist.md)** — contract files, backend fixture tests, changelog template, and version increment rules.
* Backend fixture tests: [`xconfess-backend/src/stellar/__tests__/contract-event-fixtures.spec.ts`](../xconfess-backend/src/stellar/__tests__/contract-event-fixtures.spec.ts), [`xconfess-backend/src/tipping/contract-fixtures.spec.ts`](../xconfess-backend/src/tipping/contract-fixtures.spec.ts)
* Contract fixture tests: [`xconfess-contracts/contracts/tests/backend_verification_fixtures.rs`](../xconfess-contracts/contracts/tests/backend_verification_fixtures.rs)
* [Event Schemas Reference](./event-schemas.md)
