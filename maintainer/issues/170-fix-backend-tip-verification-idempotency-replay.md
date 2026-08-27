# [170] fix(backend): enforce idempotent anonymous tip verification and replay safety

## Summary
Harden tip verification so repeated verify requests for the same transaction are safe and return deterministic outcomes.

## Problem
Retries and duplicate client submissions can create inconsistent user outcomes unless verification is idempotent and replay-aware.

## Scope
- Enforce idempotency keying on `confessionId + txHash`.
- Ensure duplicate/replay verify calls return canonical success payloads.
- Preserve single-credit guarantees for tip totals and audit entries.
- Emit clear conflict semantics for duplicate attempts that already settled.

## Files
- `xconfess-backend/src/tipping/*`
- `xconfess-backend/src/stellar/*` (verification helpers where applicable)
- `docs/stellar-anchor-and-tipping-runbook.md`

## Acceptance Criteria
- Repeated verification of the same `txHash` does not double-credit tips.
- Replay requests return stable responses without creating duplicate records.
- Logs include identifiers needed for reconciliation (`requestId`, `confessionId`, `txHash`).

## Ops Notes
- Follow runbook evidence checklist before manual intervention:
  - `docs/stellar-anchor-and-tipping-runbook.md#evidence-checklist-before-manual-intervention-or-refund`

## Labels
`bug` `backend` `tipping` `idempotency` `reliability`

## How To Test
1. Submit one tip transaction and call verify endpoint twice with same payload.
2. Confirm one persisted tip record and unchanged aggregate totals.
3. Confirm second verify call returns replay-safe success semantics.
