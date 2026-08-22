# Stellar Anchoring And Anonymous Tipping Runbook

## Purpose
Provide a single operational workflow for support and engineering when handling:
- Confession anchoring transactions.
- Anonymous tipping transactions.
- Pending, failed, duplicate, and replay scenarios.

This runbook is written for production response and tabletop drills.

## Systems And Identifiers
- Backend API modules: `xconfess-backend/src/stellar` and tipping endpoints.
- Chain network: Stellar testnet/mainnet (must match environment).
- Key identifiers to collect early:
  - `requestId` (backend request correlation id).
  - `confessionId`.
  - `txHash` (on-chain transaction hash).
  - `tipId` (backend record id, if created).
  - User-facing timestamp and timezone.

## Normal Flow: Anchor Verification And Reconciliation
1. User submits confession with anchoring enabled.
2. Backend builds and submits chain transaction.
3. Backend stores pending state with `txHash` and confession reference.
4. Verification checks chain status and marks outcome:
   - `confirmed`: anchor recorded and immutable reference is final.
   - `pending`: transaction accepted but not yet final.
   - `failed`: transaction rejected or expired.
5. Reconciliation worker re-checks pending anchors until resolved or escalated.

Operator checks for healthy flow:
- Chain/network config matches deployment target.
- Transaction appears on chain explorer.
- Backend status transitions `pending -> confirmed|failed`.
- No duplicate anchor records for the same confession hash.

## Normal Flow: Anonymous Tip Verification And Reconciliation
1. Client signs and submits tip transaction in wallet.
2. Client sends `txHash` to backend verification endpoint.
3. Backend validates transaction and writes tip record idempotently.
4. If verify endpoint is retried, duplicate/replay requests must be safe:
   - Same `txHash` + `confessionId` should not create duplicate credit.
   - Duplicate/replay responses should return stable success semantics.
5. Reconciliation worker resolves delayed settlement outcomes.

Operator checks for healthy flow:
- Wallet network matches backend network.
- `txHash` settles on chain.
- Tip record exists once and only once.
- Retry requests do not increase credited amount.

## State Handling Matrix

### Pending
- Definition: chain transaction accepted or submitted, final confirmation not yet observed.
- Action:
  - Keep status as pending.
  - Requeue verification/reconciliation.
  - Do not manually refund unless pending exceeds SLA and failure is confirmed.
- Escalate when pending exceeds agreed threshold (TIP_VERIFICATION_STALE_THRESHOLD_MINUTES).

### Stale Pending (SLA Breach)
- Definition: pending tip verification exceeds the configured SLA threshold.
- Action:
  - Mark as `stale_pending` for operator visibility.
  - Continue reconciliation attempts if the chain settles later.
  - Do not auto-refund; follow evidence checklist before manual action.

### Failed
- Definition: transaction rejected, malformed, expired, insufficient funds, or network failure.
- Action:
  - Capture precise failure code/message.
  - Confirm whether any chain side-effect occurred.
  - If no on-chain settlement, surface user-safe retry guidance.
  - If on-chain side-effect exists but backend failed to persist, run reconciliation before refund decisions.

### Replayed / Duplicate
- Definition: same tip/anchor verification is submitted multiple times.
- Action:
  - Treat as idempotent operation.
  - Return canonical existing record where available.
  - Never double-credit tip totals.


### Configuration Reference: SLA Thresholds
The system identifies stuck transactions using `TIP_VERIFICATION_STALE_THRESHOLD_MINUTES`. 

- **Default:** 30 minutes.
- **Purpose:** Defines the duration after which a `pending` tip verification is escalated to `stale_pending` for operator visibility.
- **Incident Triage:** If you receive alerts for stale tips, check this variable in your environment configuration. If your Stellar RPC/Horizon provider is experiencing known network-wide delays, you may need to temporarily increase this threshold to avoid false-positive escalations.


## Troubleshooting Playbooks

### Network Mismatch
Symptoms:
- Wallet submits on testnet while backend validates mainnet (or inverse).
- Verification cannot locate `txHash` on expected network.

Checks:
1. Confirm backend `STELLAR_NETWORK` and Horizon/RPC URL.
2. Confirm wallet network used at signing time.
3. Confirm explorer lookup network.

Recovery:
- Align wallet + backend network.
- Re-run verification after alignment.
- Do not mark failed until mismatch is corrected and a second verification is attempted.

### Failed Settlement
Symptoms:
- `txHash` exists but transaction failed/rolled back.
- Verify endpoint returns failure after chain check.

Checks:
1. Inspect transaction result code and operation codes.
2. Verify source account balance and sequence behavior.
3. Confirm destination account validity (for tips).

Recovery:
- Return explicit failure reason to client.
- Allow user retry with fresh transaction.
- Preserve failed record for audit, including request and tx identifiers.

### Stuck Pending Records
Symptoms:
- Backend record remains `pending` beyond SLA.
- Reconciliation not advancing status.
 - Record is not promoted to `stale_pending` after threshold.

Checks:
1. Confirm worker/cron is running.
2. Confirm provider connectivity and rate-limit status.
3. Re-query chain state for `txHash`.
4. Check for lock/contention preventing status update.

Recovery:
- Manually trigger reconciliation for the specific record.
- If confirmed on-chain, patch state to `confirmed`.
- If definitively failed, patch to `failed` and attach evidence.
- Document operator action with request/record ids.

## Evidence Checklist Before Manual Intervention Or Refund
Collect all items before making a manual state change:
- Environment and network (`testnet`/`mainnet`).
- `requestId`, `confessionId`, `txHash`, `tipId` (if present).
- Raw verify endpoint response payload.
- Chain explorer link and observed status.
- Relevant backend logs covering submission and verification windows.
- Reason for intervention and approver identity.

If any item is missing, pause and gather it first.

## Manual Intervention Guardrails
- Prefer reconciliation and idempotent replay before direct DB edits.
- If DB correction is required:
  - Record before/after state.
  - Link change to incident ticket.
  - Include operator and timestamp.
- Refund decisions must confirm no successful on-chain transfer was credited already.

## Tabletop Exercise Scenarios
1. Delayed chain confirmation:
   - Force a pending state and walk through escalation + evidence capture.
2. Failed anonymous tip:
   - Simulate wallet/network mismatch and verify troubleshooting steps.
3. Replay-safe verify:
   - Submit same verify payload twice and confirm duplicate-safe outcome.

## Fixture-Based Verification

The repository includes deterministic compatibility fixtures that tie contract event output to backend verification expectations. These fixtures ensure contract and backend changes don't silently break verification workflows.

### Fixture Coverage

**Anchor Events:**
- `ANCHOR_FIXTURE_BASIC`: Standard confession anchoring
- `ANCHOR_FIXTURE_ZERO_HASH`: Boundary case with all-zero hash
- `ANCHOR_FIXTURE_MAX_TIMESTAMP`: Boundary case with maximum timestamp

**Tip Settlement Events:**
- `TIP_FIXTURE_BASIC`: Standard anonymous tip with proof
- `TIP_FIXTURE_NO_PROOF`: Tip without proof metadata
- `TIP_FIXTURE_LARGE_AMOUNT`: Large amount boundary case

**Error Codes:**
- Terminal errors (6001-6002, 6005, 6008): Invalid input, auth failure
- Retryable errors (6003-6004, 6006-6007): Transient state (pause, rate limit, overflow)

### Running Fixture Tests

```bash
# Contract fixtures
cd xconfess-contracts
cargo test --test backend_verification_fixtures

# Backend stellar fixtures
cd xconfess-backend
npm test -- contract-event-fixtures.spec.ts

# Backend tipping fixtures
npm test -- contract-fixtures.spec.ts
```

### Detecting Fixture Drift

If backend tests fail with fixture mismatches:
1. Check event version (schema discriminator)
2. Verify field values match fixture constants
3. Confirm error code mappings are current
4. Review contract changelog for breaking changes

### Fixture Version Compatibility

Fixtures include version markers (`FIXTURE_VERSION`) that must be incremented when:
- Event payload structure changes
- Error code mappings change
- New fixture categories are added

When fixture version changes, backend must implement migration logic to handle both old and new versions.

## Related Maintenance Work
- `maintainer/issues/170-fix-backend-tip-verification-idempotency-replay.md`
- `maintainer/issues/173-feat-backend-chain-reconciliation-worker.md`

## Correlation Log Fields

Every verify call emits structured log lines with the following correlation fields so a single attempt can be traced end-to-end:

| Field | Type | Present in |
| :--- | :--- | :--- |
| `requestId` | string (UUID) | All tip and anchor verify log lines |
| `confessionId` | string (UUID) | Tip verify log lines |
| `txHash` | string (64-char hex) | Tip and stellar verify log lines |
| `confessionHash` | string (64-char hex) | Anchor verify log lines |
| `tipId` | string | Success and idempotent-replay log lines |
| `amount` | number | Tip verify success log line |

### Log lifecycle events (tip verify)

| Event | Level | Key fields |
| :--- | :--- | :--- |
| Verify request received | `LOG` | `requestId`, `confessionId`, `txHash` |
| Idempotent replay detected | `DEBUG` | `requestId`, `confessionId`, `txHash`, `tipId` |
| Conflict (txId reuse) | `WARN` | `requestId`, `confessionId`, `txHash`, `originalConfessionId` |
| Confession not found | `WARN` | `requestId`, `confessionId`, `txHash` |
| Transaction not found on-chain | `WARN` | `requestId`, `confessionId`, `txHash` |
| Verify succeeded | `LOG` | `requestId`, `confessionId`, `txHash`, `tipId`, `amount` |
| Horizon fetch error | `ERROR` | `requestId`, `txHash` |

### Log lifecycle events (anchor verify)

| Event | Level | Key fields |
| :--- | :--- | :--- |
| Verify request received | `LOG` | `requestId`, `confessionHash` |
| Verify completed | `LOG` | `requestId`, `confessionHash`, `isAnchored` |

### Grep recipes

```bash
# Trace a single verify attempt end-to-end
grep '"requestId":"<value>"' app.log

# Find all log lines for a specific txHash
grep '"txHash":"<value>"' app.log

# Confirm requestId and txHash appear on the same line
grep '"requestId":"<value>"' app.log | grep '"txHash":"<value>"'
```

### Security invariant

`requestId` is echoed from the incoming `x-request-id` header (or auto-generated). No secrets, private keys, or seed phrases are ever written to logs. Sender addresses are omitted when the tip is marked anonymous.

This is enforced defensively, not just by convention: `src/utils/redact-secrets.ts` scrubs Stellar secret seeds and signed-XDR-shaped blobs from any string or structured payload before it reaches `AppLogger` or the global `AllExceptionsFilter`, so an unexpected error from the signing path cannot echo `STELLAR_SERVER_SECRET` (or a signed transaction envelope) into application logs or the audit log.

## Metrics & Observability (Reconciliation Lag)

As per Issue #783, the backend emits bounded metrics to track the age of pending records. This allows operators to differentiate between "normal network delay" and "stuck records."

### 1. Metric: `reconciliation_lag`
- **Fields:**
    - `type`: `anchor` | `tip`
    - `confessionId`: UUID of the confession (for DB cross-referencing).
    - `txHash`: Truncated Stellar hash (for blockchain audit).
    - `lagSeconds`: Integer count of seconds since record creation.
    - `isStale`: Boolean (true if > 300s).

### 2. Operational Thresholds
| Lag Time | Status | Operator Response |
| :--- | :--- | :--- |
| < 60s | **Healthy** | None (Standard Stellar consensus). |
| 60s - 300s | **Warning** | Monitor for network-wide congestion. |
| > 300s | **Critical** | Record is **Stale**. Follow "Stuck Pending Records" playbook. |

### 3. Log Example (JSON)
```json
{
  "level": "info",
  "metric": "reconciliation_lag",
  "type": "anchor",
  "confessionId": "conf_882",
  "txHash": "GC7A...234",
  "lagSeconds": 450,
  "isStale": true,
  "message": "[METRIC] anchor reconciliation lag: 450s"
}
- `maintainer/issues/223-fix-contracts-add-backend-verification-compatibility-fixtures.md`
