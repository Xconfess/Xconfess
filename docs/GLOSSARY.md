# XConfess Glossary

## A

### Anchoring

The process of recording a cryptographic hash (SHA-256) of a confession on the Stellar blockchain via Soroban smart contracts. Once anchored, the confession's existence and content can be independently verified at a specific point in time without revealing the author's identity. See the [Anchoring section](DEMO_SCRIPT.md#4-stellar-flow--confession-anchoring) of the demo script, the [contract ABI reference](contract-abi-reference.md#confession-anchor-contract), and the [Soroban setup guide](SOROBAN_SETUP.md) for contract deployment and interaction details.

### Anonymous Tipping

A Stellar-based feature that allows users to send tips to confession authors without revealing their identity. Users sign and submit tip transactions through their wallet, then send the transaction hash to the backend for verification. The system validates the transaction on-chain and records tip amounts idempotently, ensuring no double-crediting even with replayed verification requests. Supports optional settlement proof metadata for off-chain reconciliation. See the [Anonymous Tipping contract reference](contract-abi-reference.md#anonymous-tipping-contract) and the [Stellar anchoring and tipping runbook](stellar-anchor-and-tipping-runbook.md) for operational details.

## D

### Dead Letter Queue (DLQ)

A protected operational queue for work that exhausted its normal retry policy and needs administrator review. In XConfess, notification jobs from the `notifications` BullMQ queue are copied into the `notifications-dlq` queue as `dead-letter` jobs after their final failed attempt. Each DLQ entry keeps the original notification payload plus failure metadata such as the original job id, failure time, attempts made, and last error. Administrators can inspect, filter, replay, export, or clean up these entries through the admin notification DLQ surfaces, including the protected `/api/admin/dlq` endpoints and the admin notifications dashboard. Replay and cleanup actions are recorded in the audit log so operators can track who handled failed notification work and why.

## H

### Health Endpoints

Three backend endpoints for monitoring system status: `GET /api/health/live` (liveness - process responsive, no dependency checks), `GET /api/health/ready` (readiness - checks Postgres, Redis, BullMQ queues, and schema), and `GET /api/health` (legacy alias for `/ready`). Use `/live` for quick smoke tests and `/ready` for pre-deployment verification. See the [Health Check Documentation](../xconfess-backend/src/health/HEALTH_CHECK_DOCUMENTATION.md) for detailed troubleshooting and response schemas.
