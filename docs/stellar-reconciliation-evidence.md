# Stellar Reconciliation Evidence

Date: 2026-09-05

This document summarizes the production-safety behavior around Stellar tipping,
reconciliation, and contract metadata. It documents real system behavior only;
it does not claim live usage, transaction volume, or traction.

## Tip Verification

- Tip verification is idempotent by `SHA256(confessionId:txId)`.
- `tips.idempotency_key` has a DB-enforced partial unique index.
- The HTTP verifier inserts a pending sentinel before calling Stellar so
  concurrent requests cannot double-credit a transaction.
- A verified tip is finalized only after Horizon transaction existence,
  native XLM payment operation, amount bounds, and precision checks pass.
- Analytics events are best-effort and privacy-safe. They include transaction
  hash, aggregate amount, asset, network, and domain IDs only.

## Reconciliation

- `ChainReconciliationService` retries pending and stale pending tips with
  bounded exponential backoff.
- Reconciliation now refuses to mark a tip as verified if the persisted amount
  is missing, zero, below minimum, above maximum, or exceeds XLM precision.
- Reconciled terminal states clear processing locks and persist
  `lastChainStatus` for operator visibility.
- Reconciled successful tips emit the same settlement audit action used by the
  request-time verifier, with `settledBy: chain_reconciliation`.
- Reconciled successful/failed transactions emit idempotent aggregate analytics
  events keyed by event name and transaction hash.

## Diagnostics

- Admin Stellar diagnostics include Horizon liveness, deployment metadata
  freshness, contract IDs, stale anchor count, pending tip count, stale tip
  count, and Soroban index checkpoint summary.
- Diagnostics are aggregate-only and do not expose confession content, message
  bodies, private keys, seed phrases, auth tokens, sender addresses, or raw
  upstream error bodies.

## Soroban Event Checkpoints

- `soroban_event_checkpoints` stores one checkpoint per network and contract.
- Checkpoints persist last processed ledger, cursor, indexed event count, failed
  event count, last indexed time, and last sanitized error code.
- The checkpoint service validates network, contract ID, ledger, and cursor
  bounds before writing.
- Indexed-event analytics use idempotency keys derived from contract, ledger,
  and cursor. They do not persist raw event payloads.
- Failure recording stores a bounded `errorCode`, not provider response bodies.

## Contract Registry

- `StellarConfigService` can fall back to `deployments/<network>.json` for
  contract IDs.
- When `STELLAR_FEATURES_ENABLED=true`, boot validation rejects deployment
  metadata from the wrong network.
- Explicit contract IDs must match deployment metadata for the configured
  network, preventing stale testnet/mainnet contract mixups.

## Validation

- `npm test --workspace=xconfess-backend -- chain-reconciliation --runInBand`
- `npm test --workspace=xconfess-backend -- stellar-diagnostics.service --runInBand`
- `npm test --workspace=xconfess-backend -- stellar-config.service --runInBand`
- `npm test --workspace=xconfess-backend -- soroban-event-checkpoint --runInBand`
- `npm run build --workspace=xconfess-backend`
- `npm run lint --workspace=xconfess-backend`
