# Incident Rollback Runbook

Use this runbook for inconsistent releases or incident rollback. The incident commander is accountable for the decision; execute each boundary only after evidence is captured.

## Ownership and escalation

- **Primary owner:** Backend/Platform on-call.
- **Contract owner:** Contract maintainer on-call; approval required for any contract or Stellar transaction.
- **Frontend owner:** Frontend on-call.
- **Database owner:** Database/Platform on-call; approval required before destructive rollback.
- Escalate to the repository maintainers and the deployment environment approver when evidence is incomplete or a rollback would affect irreversible ledger state.
- Record the incident channel, incident commander, approvers, start time, commit SHA, affected environment, and rollback result in the incident evidence pack.

## Rollback boundaries

| Boundary | Safe rollback action | Block / prerequisite | Health check |
|---|---|---|---|
| Frontend | Redeploy the previous `.next` artifact and environment variables. | Preserve API compatibility; do not mix contract-facing schemas. | `GET /`, frontend smoke test, browser console/network check. |
| Backend | Redeploy the previous `dist` artifact and environment file. | Stop workers and preserve database compatibility; do not roll back migrations without DB approval. | `/api/health/live`, `/api/health/ready`, and deployed smoke tests. |
| Database | Restore the previous verified snapshot only for a reversible, compatible schema change. | Stop writes; use a disposable restore first; migrations must have tested `down` behavior or forward-fix. | PostgreSQL readiness, migration metadata, representative read, and application readiness. |
| Soroban contract | Point clients at the previous verified contract ID/ABI when the previous instance remains deployed. | Contract-state migration may be irreversible and new transactions may already be final. | Contract ABI/ID manifest check, read-only calls, parser fixture parity, testnet smoke where applicable. |

## Irreversible Stellar actions

Do not assume these actions are reversible:

- Submitted, confirmed ledger transactions and generated events.
- Contract deployments and installed WASM IDs.
- Administrative actions that mutate on-chain configuration, roles, governance, pause state, or reputation.
- Badge grants/revoke actions, token or asset transfers, and tipping settlements.
- Any transaction that has reached consensus, even if an application UI later rolls back.

A confirmed on-chain action requires a compensating transaction or a client/ABI rollback, not deletion of ledger history. If the previous contract is not deployed or backward-compatible, stop and escalate to the Contract owner.

## Incident procedure

1. Declare scope and freeze deployments. Capture commit SHAs, contract IDs, migration IDs, artifact URLs, environment values names (never values), and affected users.
2. Decide the rollback boundary. Never roll back database or contract state first unless the application owner confirms it is safe.
3. Frontend rollback: restore the previous artifact and verify user-facing routes.
4. Backend rollback: restore the previous artifact, then verify liveness/readiness and contract-fixture parity.
5. Database rollback: restore into a disposable PostgreSQL environment, run migrations and health checks, obtain Database owner approval, then switch only after backups and evidence are complete.
6. Contract rollback: prefer routing to a previous compatible contract ID or deploying a forward fix. Verify ABI and event/error fixtures before re-enabling traffic.
7. Re-run smoke checks and record the decision, outcome, and recovery point objective.

## Evidence requirements

Keep evidence that contains no secrets or private customer data:

- Deployment run ID, commit SHA, artifact SHA256, timestamps, and owner approvals.
- Before/after health status and migration state.
- Contract manifest ID/ABI hashes, transaction hashes (if already public), and fixture validation output.
- Database backup identifier, restore duration, failure stage, migration status, and disposable-environment health result.
- Dashboard logs/alerts reduced to request counts and error categories.

## Remediation after failure

If rollback fails, stop changes, document the exact stage, preserve evidence, escalate, and choose a forward-fix or traffic isolation plan. Do not retry database restore or Stellar submission without owner approval and a corrected runbook.

## Local verification commands

```bash
npm run contracts:fixtures:verify
npm run database:restore:verify
npm run sbom:generate
npm run deploy:smoke
```

For a real database backup:

```bash
npm run database:restore:verify -- --backup=/absolute/path/to/non-sensitive-backup.sql
```
