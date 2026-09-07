# Stellar Contract Event Indexer Compatibility Layer

> Backend module: `xconfess-backend/src/stellar/event-parser/`
> Source of truth for topics/field order: [`docs/contract-abi-reference.md`](./contract-abi-reference.md#public-event-schema-fixtures)

## Why this exists

The backend indexer parses events emitted by four Soroban contracts
(`confession-anchor`, `confession-registry`, `anonymous-tipping`,
`reputation-badges`). Contract upgrades can add fields or bump
`event_version` independently of backend deploys. Without a durable,
versioned parser, an upgrade or an unexpected event shape can silently break
anchoring, tips, reputation, or moderation workflows. This module gives the
backend a single, pure, dependency-free place to decode events and to fail
closed — loudly and with a typed, retry-aware error — instead of guessing.

## Module layout

| File | Purpose |
| --- | --- |
| `contract-event-parser.types.ts` | `RawContractEvent`, `ParsedContractEvent`, `ContractEventParseError`, `EventParseErrorCode`. |
| `contract-event-parser.ts` | The versioned registry (`EVENT_SCHEMAS`) and `parseContractEvent()` / `parseGovernanceStreamEvent()` / `getCompatibilityMatrix()`. |
| `contract-event-fixtures.ts` | One deterministic fixture per registered (topic, version) schema — reused by the fixture-coverage and parity tests. |
| `contract-event-parser.spec.ts` | Fixture coverage, fixture/registry parity, and error-classification tests. No live Stellar RPC involved — parsing is a pure, synchronous function over already-fetched event data. |
| `contract-event-parser.doc-parity.spec.ts` | Parses the ABI reference's fixture table and asserts the registry matches it row-for-row — the contract/backend parity test (see below). |

## Compatibility matrix

Generated from `getCompatibilityMatrix()` (also asserted 1:1 against fixtures
in `contract-event-parser.spec.ts`):

| Event | Category | Topic | Version | Field order |
| --- | --- | --- | --- | --- |
| `ConfessionAnchoredEvent` | anchor | `confession_anchor` | 1 | event_version, timestamp, anchor_height |
| `VersionCompatibilityCheckedEvent` | anchor | `version_compatibility_checked` | 1 | event_version, nonce, timestamp, from_major, from_minor, from_patch, to_major, to_minor, to_patch, compatible |
| `SettlementEvent` | tip | `tip_settl` | 1 | recipient, event_version, settlement_id, amount, proof_metadata, proof_present, timestamp |
| `ConfessionEvent` | confession | `confess` | 1 | event_version, confession_id, author, content_hash, nonce, timestamp, correlation_id |
| `ReactionEvent` | reaction | `react` | 1 | event_version, confession_id, reactor, reaction_type, nonce, timestamp, correlation_id |
| `PauseChangedEvent` | pause | `tip_pause` | 1 | actor, paused, reason, timestamp |
| `ReportEvent` | report | `report` | 1 | event_version, confession_id, reporter, reason, nonce, timestamp, correlation_id |
| `ReportSubmittedLedgerEvent` | report | `report` | 1 | confession_id, actor, reason, event_version, nonce, timestamp |
| `RoleEvent` | role | `role` | 1 | event_version, user, role, granted, nonce, timestamp, correlation_id |
| `GovernanceProposedEvent` | governance | `gov_prop` | 1 | proposal_id, proposer |
| `GovernanceApprovedEvent` | governance | `gov_app` | 1 | proposal_id, approver |
| `GovernanceApprovalRevokedEvent` | governance | `gov_rev` | 1 | proposal_id, actor |
| `GovernanceExecutedEvent` | governance | `gov_exec` | 1 | proposal_id, executor |
| `GovInvariantViolationEvent` | governance | `gov_inv` | 1 | nonce, timestamp, operation, reason, attempted_by |
| `GovernanceEvent` | governance | *(dynamic per-proposal stream — see below)* | 1 | event_version, metadata, nonce, timestamp |
| `BadgeEvent` | reputation | `badge` | 1 | event_version, badge_id, badge_type, owner, action, nonce, timestamp |
| `BadgeEvent` | reputation | `badge_awarded` | 1 | event_version, badge_id, badge_type, owner, action, timestamp |
| `BadgeEvent` | reputation | `badge_granted` | 1 | event_version, badge_id, badge_type, owner, action, timestamp |
| `BadgeEvent` | reputation | `badge_revoked` | 1 | event_version, badge_id, badge_type, owner, action, timestamp |
| `ReputationAdjustedData` | reputation | `reputation_adjusted` | 1 | user, amount, reason, timestamp |
| `ReputationDecayedData` | reputation | `reputation_decayed` | 1 | user, old_reputation, new_reputation, epochs_applied, timestamp |

**Note on `report`**: two distinct event shapes share the literal topic
`report`. The parser disambiguates by field count (7 fields → `ReportEvent`,
6 fields → `ReportSubmittedLedgerEvent`). If a future version introduces a
third shape with a colliding field count on this topic, it cannot be safely
disambiguated by count alone — give it a distinct topic instead.

**Note on `GovernanceEvent`**: its topic is a per-proposal stream name
decided at emission time, not a fixed string, so it isn't in the topic
registry. Call `parseGovernanceStreamEvent(eventVersion, values)` directly
for these events rather than routing by topic string.

**Note on events without an `event_version` field** (`PauseChangedEvent`,
`GovernanceProposedEvent`/`GovernanceApprovedEvent`/`GovernanceApprovalRevokedEvent`/`GovernanceExecutedEvent`,
`ReputationAdjustedData`, `ReputationDecayedData`): the contract payload
doesn't carry a version, so callers pass `eventVersion: 1` by convention.
If any of these payloads changes shape, it must gain a real `event_version`
field so this convention doesn't become ambiguous.

## Error classification (fail closed)

`parseContractEvent` never guesses. Every failure is a typed
`ContractEventParseError` with a `code` and a `retryable` flag:

| Code | Meaning | `retryable` |
| --- | --- | --- |
| `UNKNOWN_TOPIC` | No registry entry for this topic at all. | `false` — needs a registry entry, not a retry. |
| `UNSUPPORTED_VERSION` (newer) | `event_version` is higher than any version this backend knows for the topic. | `true` — the contract was upgraded ahead of the backend; reprocessing after deploying the matching parser version can succeed. |
| `UNSUPPORTED_VERSION` (older/gap) | `event_version` is below the known range for the topic. | `false` — that version was deprecated, not merely unimplemented. |
| `MALFORMED_PAYLOAD` | Topic and version are known, but the field count doesn't match any registered shape. | `false` — the payload itself is invalid. |

An indexer should park `retryable: true` failures in a dead-letter/replay
queue to reprocess after the next backend deploy, and alert immediately on
`retryable: false` failures since those require a code or data fix.

## How to add a new event version safely

1. Update `docs/contract-abi-reference.md` § "Public Event Schema Fixtures"
   first — add the new row with its topic, version, and field order. This
   doc is the contract between contract authors and backend consumers, and
   both sides' tests are pinned to it (see "Contract ⇄ backend parity" below).
2. Add the matching entry to `PUBLIC_EVENT_SCHEMA_FIXTURES` in
   `xconfess-contracts/contracts/events.rs`.
3. Append a **new** entry to `EVENT_SCHEMAS` in `contract-event-parser.ts`
   with the bumped `eventVersion`. **Never mutate or delete an existing
   entry** — historical on-chain events emitted under the old schema must
   keep parsing after the upgrade.
4. Add a fixture for the new version to `contract-event-fixtures.ts`.
5. Run the test commands below. The backend fixture-coverage test iterates
   every fixture, the fixture/registry parity test asserts the registry and
   fixture set stay 1:1, and the doc-parity test asserts the registry matches
   the doc table row-for-row — all three fail if anything diverges.

## Contract ⇄ backend parity

There's no cross-language fixture loader (Rust `cargo test` and TypeScript
`jest` don't share a runtime), so parity is enforced transitively through
`docs/contract-abi-reference.md` as the single shared source of truth:

- **Contract side**: `xconfess-contracts/contracts/events.rs` defines
  `PUBLIC_EVENT_SCHEMA_FIXTURES`, and its test
  `events::tests::public_event_metadata_matches_documented_abi` asserts every
  entry's event name and fields literally appear in the ABI reference doc.
- **Backend side**: `contract-event-parser.doc-parity.spec.ts` parses the
  same "Public Event Schema Fixtures" markdown table and asserts
  `contract-event-parser.ts`'s registry matches it exactly — same topics,
  same field order, same row count, in both directions (no undocumented
  registry entries, no unregistered doc rows).

If both tests pass, the contract registry and the backend registry agree,
because both are pinned to the same doc. A change to either registry that
isn't reflected in the doc — or a doc change not reflected in the registry —
fails on whichever side didn't update.

## Running the tests

```bash
# Backend — fixture coverage, fixture/registry parity, error classification,
# and contract/backend parity via the shared ABI doc
cd xconfess-backend
npx jest --config jest.config.js src/stellar/event-parser

# Contract — asserts PUBLIC_EVENT_SCHEMA_FIXTURES matches the same doc
cd xconfess-contracts
cargo test -p confession-registry --lib public_event_metadata_matches_documented_abi
```

Current status: **54/54 backend tests passing** (fixture coverage for all 9
event categories — anchor, tip, confession, reaction, report, role,
governance, badge, reputation, plus pause under the tipping contract's pause
control — fixture/registry parity, error-classification for all three typed
error codes, and 24 doc-parity assertions) and the contract-side
`public_event_metadata_matches_documented_abi` test passing.
