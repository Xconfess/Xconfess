# Soroban Resource Assumptions (Maintainers & Deployers)

> **Audience:** contract maintainers, release engineers and anyone deploying or
> operating a Xconfess Soroban deployment.
>
> **Scope:** the four workspace contracts in `xconfess-contracts/` —
> `confession-anchor`, `confession-registry`, `anonymous-tipping`,
> `reputation-badges`.

This document makes the resource model **explicit**. Soroban charges CPU
instructions and memory bytes for every storage access and every byte
serialised into an event. An unbounded string in an event, an unbounded page
size, or an unbounded batch can turn a cheap write into a transaction that
exceeds the network limit or floods indexers. The bounds and budgets below are
the contract's side of that bargain.

---

## 1. Resource model and footprint

### 1.1 Storage classes

| Class | Used for | TTL behaviour |
| --- | --- | --- |
| **Instance** | Pause flag, admins, counters, schema versions, pause-event nonce, report registry | Lives with the contract instance; bumped by instance maintenance. |
| **Persistent** | Tipping recipient totals, settlement receipts, badge ownership & metadata, reputation | `PERSISTENT_TTL_LEDGERS = 44_640` ledgers (~7 days at 5s/ledger); extended on every write. |

### 1.2 Representative footprint (per operation)

| Operation | Instance keys read/written | Persistent keys read/written | Event emitted |
| --- | --- | --- | --- |
| `anchor_confession` | `count`, optional `LastAnchorTimestamp` | — | `ConfessionAnchoredEvent` (vec, 3 data fields) |
| `pause` / `unpause` (anchor) | `Paused`, `PauseEventNonce` | — | `PauseStateChangedEvent` (vec, 6 data fields) |
| `send_tip_with_proof` | `IsPaused`, `SettlementNonce`, `GlobalTipCount` (if v2) | `RecipientTotal`, `SettlementReceipt` (+2 TTL bumps) | `SettlementEvent` (single value, proof metadata ≤ 128 chars) |
| `create_confession` (registry) | counter + author index (≤ `MAX_AUTHOR_CONFESSIONS_PER_AUTHOR = 128`) | — | `ConfessionCreatedEvent` |
| `create_badge` | `Paused` | `Admin`, `BadgeTypeMetadata` (3 bounded strings ≤ 128 each) | `badge_type_created` |
| `list_confessions` / `list_reports` | counter + up to **51** registry reads | — | none |

**Rules of thumb**

* One event field = one serialised value. Variable-width fields are bounded
  (see §3) so the event footprint is O(number of fields), never O(caller input).
* Every persistent write in tipping also performs two `extend_ttl` calls —
  budget for three persistent operations per settlement, not one.
* Pagination reads `limit + 1` items to compute `has_next_page`.

---

## 2. Recorded budgets

### 2.1 Release baseline (`gas-baseline.json`)

| Contract | Function | CPU | MEM |
| --- | --- | ---: | ---: |
| confession-anchor | `anchor_confession` | 28,762 | 3,326 |
| confession-anchor | `verify_confession` | 24,278 | 3,020 |
| anonymous-tipping | `get_tips` | 27,563 | 3,158 |
| anonymous-tipping | `send_tip` | 51,246 | 5,515 |
| confession-registry | `create_confession` | 102,698 | 13,154 |
| confession-registry | `update_status` | 135,147 | 20,653 |
| reputation-badges | `get_badges` | 45,192 | 4,738 |
| reputation-badges | `mint_badge` | 118,196 | 15,999 |

These numbers are produced by `contracts/*/tests/benchmarks.rs` and are the
authoritative regression baseline (5% threshold — see
[`soroban-gas-baseline-maintenance.md`](./soroban-gas-baseline-maintenance.md)).

### 2.2 Debug-test envelopes (new resource regression suite)

`contracts/tests/resource_regression.rs` measures the **maximum-bound** paths
in a debug test build and asserts generous ceilings (`CPU ≤ 5,000,000`,
`MEM ≤ 5,000,000`). Observed values at the time of writing:

| Scenario | CPU | MEM |
| --- | ---: | ---: |
| Anchor pause with 128-char reason | 74,440 | 9,107 |
| Anchor pause with oversized reason (rejected) | 42,180 | 5,216 |
| Tip with 128-char proof metadata | 180,471 | 23,633 |
| Badge creation with 3 × 128-char metadata | 69,387 | 9,594 |
| Batch of 16 anchored confessions | 222,294 | 41,215 |

The rejected-oversized path is **cheaper** than the accepted path because
validation runs before event serialisation. If that ever inverts, a bound has
been removed or moved too late.

---

## 3. Worst-case operations

| Operation | Worst case | Bound | Why it is safe |
| --- | --- | --- | --- |
| `list_confessions` | 51 sequential instance reads (50 returned + 1 lookahead) | `limit.min(50)` | Constant ceiling regardless of caller `limit`. |
| `list_reports` | 51 sequential instance reads | `MAX_LIMIT = 50` | Same. |
| Author confession index | 128 entries per author | `MAX_AUTHOR_CONFESSIONS_PER_AUTHOR = 128` | Rejection is a stable error, not a panic. |
| Reputation decay | 52 epochs per calculation | `MAX_EPOCHS_PER_CALCULATION = 52` | Caps per-call CPU to one year of decay. |
| Rate-limit window | 1,000 tips/window per wallet | `DEFAULT_MAX_TIPS_PER_WINDOW = 1_000` | Bounds persistent receipts created in a window. |
| Anchor batch (regression fixture) | 16 writes + 16 events | test fixture | Exercises linear scaling without hitting the host limit. |
| Event payloads | 128 chars per variable string | §4 table | Rejection occurs before state mutation or event publication. |

Deployers should assume the worst-case read path is **~51 storage reads** and
the worst-case single write path is **~3 persistent operations + 1 event**.

---

## 4. Per-event payload bounds

Defined once in
[`xconfess-contracts/contracts/event_bounds.rs`](../xconfess-contracts/contracts/event_bounds.rs)
and compiled into every crate:

| Event | Field | Max length |
| --- | --- | ---: |
| `PauseStateChangedEvent` | `reason` | 128 |
| `SettlementEvent` | `proof_metadata` | 128 |
| `ReportSubmittedLedgerEvent` | `reason` | 128 |
| `BadgeEvent` | badge metadata strings | 128 |
| Symbols (`content_hash`, `reaction_type`, `role`, …) | — | 32 (host-enforced) |

Oversized inputs are rejected with **stable errors**:
`EventPayloadError::PayloadTooLarge` (code 1005), mapped by contracts to their
own stable codes (tipping `6002`, badge `8`, anchor pause `17`). The tests in
`contracts/tests/event_payload_bounds.rs` verify the exact fencepost for every
stream.

---

## 5. Linking budgets to regression commands

Run from the **monorepo root** unless noted:

| Purpose | Command |
| --- | --- |
| All contract tests (incl. new bound/resource suites) | `npm run contract:test` |
| Only the new regression suites | `cd xconfess-contracts && cargo test -p confession-registry --test event_payload_bounds --test pause_traceability --test resource_regression` |
| Anchor timestamp + migration tests | `cd xconfess-contracts && cargo test -p confession-anchor --test timestamp_policy --test migration` |
| Benchmarks vs baseline (5% threshold) | `./scripts/contracts-gas-checks.sh` |
| Refresh baseline after an intentional change | `./scripts/contracts-gas-checks.sh --update` |
| Contract-level snapshot / compare | `cd xconfess-contracts && ./contracts/scripts/gas-snapshot.sh` then `./contracts/scripts/gas-compare.sh` |
| Backend event-parser parity | `cd xconfess-backend && npx jest --config jest.config.js src/stellar/event-parser` |

Every new event field, bound change or pagination change **must** be
accompanied by a run of the first, third and sixth commands.

---

## 6. Maintenance procedure

1. **Change the code.** Add or adjust the bound in `event_bounds.rs`, update the
   `EVENT_PAYLOAD_BOUNDS` table, and wire the validator into the emit path
   before any state mutation / event serialisation.
2. **Update the fencepost tests.** Every bound needs an "exact = accepted" and
   "exact + 1 = rejected with stable error" test in
   `contracts/tests/event_payload_bounds.rs`.
3. **Update the envelope.** Re-run the resource regression suite with
   `--nocapture`, record any materially new numbers in §2.2, and keep the
   ceilings generous. Never lower a ceiling to make a regression pass.
4. **Update the baseline.** If the change intentionally alters gas, run
   `./scripts/contracts-gas-checks.sh --update` and commit `gas-baseline.json`
   with the code change (see
   [`soroban-gas-baseline-maintenance.md`](./soroban-gas-baseline-maintenance.md)).
5. **Update the ABI contract.** If the event payload shape changed, follow
   [`contract-event-version-bump-checklist.md`](./contract-event-version-bump-checklist.md):
   add a new fixture row to `docs/contract-abi-reference.md`, append (never
   mutate) registry entries in `contract-event-parser.ts`, add a fixture in
   `contract-event-fixtures.ts`, and run the parser tests.
6. **Document operational impact.** Note any new storage footprint or worst-case
   operation in §1 and §3 above. Deployers rely on those tables for capacity
   planning.
7. **Review checklist.** A PR touching bounds/budgets must answer:
   * Is the bound enforced before mutation and before event serialisation?
   * Is the rejection a stable error code (no string panic)?
   * Do the fencepost and resource regression tests cover the new path?
   * Are the doc tables and fixtures in sync?

---

## 7. Related documents

* [Soroban Gas Baseline Maintenance](./soroban-gas-baseline-maintenance.md)
* [Contract ABI Reference — Public Event Schema Fixtures](./contract-abi-reference.md#public-event-schema-fixtures)
* [Event Parser Compatibility](./contract-event-parser-compatibility.md)
* [Event Version Bump Checklist](./contract-event-version-bump-checklist.md)
* [Contract Threat Model](./contract-threat-model.md)
