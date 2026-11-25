# Critical Contract Review Delay Policy

This document defines which contract changes require a mandatory review window, how the
enforcement gate works, and how to schedule, inspect, cancel, or clear a window. It is the
companion to [`docs/contract-release-and-upgrade-runbook.md`](./contract-release-and-upgrade-runbook.md).

**Principle:** a critical change cannot be executed until an approved schedule has been
pending for at least the policy delay. There is no CLI flag that bypasses the gate.

---

## 1. Actions that require a delay

The authoritative catalogue lives in `scripts/lib/review-delay.js` and can be printed at any time:

```bash
npm run contract:review-delay -- list-actions
```

| Action ID | Description | Default delay |
|---|---|---:|
| `contract.deploy.mainnet` | Deploying release WASM to a public/mainnet Stellar network | 24 hours |
| `contract.signer-rotation` | Rotating a contract signer or deployer key alias | 48 hours |
| `contract.schema-migration` | Applying a versioned on-chain storage migration | 24 hours |
| `contract.governance-critical-action` | Executing a governance proposal that changes contract settings | 24 hours |
| `contract.emergency-pause-change` | Changing a pause/unpause state on a live contract | 1 hour |

Network classification for the canonical release script:

| `--network` value | Mapped action | Gated? |
|---|---|---|
| `public`, `mainnet`, `production` | `contract.deploy.mainnet` | Yes |
| `testnet`, `futurenet`, any other alias | — | No |

Non-critical networks still follow the normal build/check/deploy flow and the mainnet safety
gate described in the runbook; they simply do not require a review window.

---

## 2. How enforcement works

`scripts/contracts-release.sh deploy` calls `action-for-network` before deploying. When the
network is critical it runs:

```bash
node scripts/contract-review-delay.js check --action contract.deploy.mainnet
```

- A missing schedule, a cancelled schedule, a cleared schedule, or an already-executed
  schedule is **blocked**.
- A pending schedule whose deadline has not passed is **blocked**, and the remaining time is
  printed.
- Only a pending schedule with `now >= deadline_at` is **allowed**.
- `--force` does **not** bypass this gate. It only relaxes the first-deployment rollback guard.
- After a successful deployment the script records a `REVIEW_DELAY_EXECUTED` event so the
  same window cannot be replayed.

State is stored in a local, gitignored ledger (`.review-delay/` by default):

- `ledger.json` — current schedule per action.
- `events.jsonl` — append-only audit events (`SCHEDULED`, `CANCELLED`, `CLEARED`, `BLOCKED`, `EXECUTED`).

Override the location with `REVIEW_DELAY_DIR=/path/to/ledger` for shared/CI ledgers. Every
event contains the action, actor, reference, timestamp, and reason — never key material.

---

## 3. Scheduling, inspecting, cancelling, and clearing

Start a review window (re-scheduling resets the clock, so a short delay can never replace an
already-running window):

```bash
npm run contract:review-delay -- schedule \
  --action contract.deploy.mainnet \
  --actor "$(git config user.name)" \
  --reference "PR-1234"
```

Inspect the current state and the elapsed/remaining time:

```bash
npm run contract:review-delay -- status --action contract.deploy.mainnet
npm run contract:review-delay -- check  --action contract.deploy.mainnet   # exit 0 only when allowed
```

For any action that does not go through `contracts-release.sh` (signer rotation, migration,
governance, pause changes), wrap the actual command with `run`. It refuses to execute until
the window has elapsed and records the execution only if the command succeeds:

```bash
npm run contract:review-delay -- run \
  --action contract.signer-rotation \
  --actor "$(git config user.name)" \
  --reference "PR-1234" \
  -- ./scripts/rotate-signer.sh testnet
```

Cancel a pending window. The action stays in the ledger with status `cancelled`, which is a
permanent block until a new window is scheduled:

```bash
npm run contract:review-delay -- cancel \
  --action contract.deploy.mainnet \
  --actor "$(git config user.name)" \
  --reason "security review requested more time"
```

Clear a window entirely (useful for a stale entry or a typo). A cleared action must be
re-scheduled before it can execute:

```bash
npm run contract:review-delay -- clear \
  --action contract.deploy.mainnet \
  --reason "superseded by release 1.2.0"
```

Read the audit trail:

```bash
npm run contract:review-delay -- events --action contract.deploy.mainnet
```

A delay override is available for local drills only and is bounded to `1..2592000` seconds:

```bash
node scripts/contract-review-delay.js schedule \
  --action contract.deploy.mainnet --delay-seconds 60 --actor drill
```

---

## 4. Invariants

These properties are enforced by `scripts/__tests__/review-delay.test.js` and the shell
integration test `scripts/__tests__/contract-review-delay-gate.test.sh`:

1. No schedule means no execution.
2. A pending action is blocked until exactly `scheduled_at + delay_seconds`.
3. A cancelled or cleared action is blocked even long after the original deadline.
4. Re-scheduling resets the deadline, and an executed window cannot be replayed.
5. `--force` never bypasses the delay.
6. Every state transition produces a structured, secret-free event.

Run them locally with:

```bash
npm run contract:review-delay:test
```

---

## 5. Reviewer checklist

- [ ] The action ID matches the change being made.
- [ ] `--reference` points to the reviewed PR, ticket, or release record.
- [ ] The delay was scheduled before approval, not backdated.
- [ ] `status` shows `delay_elapsed` before running the deploy command.
- [ ] `events` shows exactly one `REVIEW_DELAY_EXECUTED` for the release.
- [ ] No cancellation or clear event was ignored or overwritten.
