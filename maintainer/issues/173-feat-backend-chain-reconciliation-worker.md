# [173] feat(backend): add chain reconciliation worker for anchor and anonymous tip settlement

## Summary
Introduce a reconciliation worker that continuously resolves pending anchor/tip records against authoritative chain state.

## Problem
Pending records can remain stale during provider delays/outages, creating support burden and inconsistent user-facing states.

## Scope
- Add background reconciliation loop for pending anchor and tip verification records.
- Re-check chain status and progress records to `confirmed` or `failed`.
- Add bounded retries, backoff, and dead-letter visibility for unresolved cases.
- Emit structured logs/metrics for reconciliation lag and resolution outcomes.

## Files
- `xconfess-backend/src/stellar/*`
- `xconfess-backend/src/tipping/*`
- `xconfess-backend/src/notification/*` (if queue integration is reused)
- `docs/stellar-anchor-and-tipping-runbook.md`

## Acceptance Criteria
- Pending records are retried automatically without manual polling.
- Reconciliation transitions are auditable and idempotent.
- Operators can identify and escalate stuck pending records with clear evidence.

## Ops Notes
- Incident workflow and escalation evidence are documented in:
  - `docs/stellar-anchor-and-tipping-runbook.md#troubleshooting-playbooks`
  - `docs/stellar-anchor-and-tipping-runbook.md#evidence-checklist-before-manual-intervention-or-refund`

## Labels
`feature` `backend` `stellar` `ops` `reliability`

## How To Test
1. Seed pending anchor and tip records with delayed confirmations.
2. Run worker and confirm automatic state progression when chain confirms.
3. Simulate permanent failure and verify transition to failed with operator evidence fields logged.
