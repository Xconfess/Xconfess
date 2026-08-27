# XConfess Contract Threat Model & Security Assumptions

This document outlines the security assumptions, trust model, privileges, and known threat mitigations for the `ConfessionAnchor` smart contract on the Stellar network.

## 1. Trust Model and Privileges

The XConfess smart contract uses a role-based access control (RBAC) system with two highly privileged roles: **Owner** and **Admin**.

### 1.1 Owner (Deployer)
- **Role Definition:** The solitary address specified during the `initialize()` function immediately after contract deployment.
- **Capabilities:**
  - Can assign or revoke the `Admin` role to other addresses.
  - Can completely transfer the `Owner` role to a new address.
  - Can pause or resume the contract to block write operations during maintenance or emergencies.
- **Trust Assumption:** The Owner is assumed to be fully trusted and controlled by the core platform administrators. Compromise of the Owner key compromises the administration of the contract but does not forge existing confession anchors.

### 1.2 Admin
- **Role Definition:** Designed for automated backend systems or moderators.
- **Capabilities:**
  - Can execute restricted actions like resolving reported confessions via `resolve()`.
- **Trust Assumption:** Admins are trusted to manage the moderation state. If an Admin key is compromised, an attacker could mark arbitrary confessions as resolved, bypassing the moderation layer.

## 2. Platform Architecture Assumptions

The contract relies on an off-chain/on-chain hybrid architecture:

- **Off-chain Content:** The actual confession text, user profiles, and metadata reside entirely in the off-chain Postgres database managed by `xconfess-backend`.
- **On-chain Anchoring:** Only a `BytesN<32>` hash (e.g., SHA-256) of the confession content and its timestamp are stored on the Stellar blockchain.
- **Immutability of Hashes:** The primary invariant is that once a hash is anchored, the ledger sequence and timestamp recorded for that hash cannot be altered by any role, not even the Owner. It serves as cryptographic proof that the data existed in the backend at a specific point in time.

## 3. Threat Analysis & Mitigations

### 3.1 Hash Collision and Duplication
- **Threat:** An attacker tries to re-anchor an already known confession hash to spoof its timestamp.
- **Mitigation:** The `anchor_confession` function enforces strict uniqueness. If a hash already exists in instance storage, it returns `"exists"` without modifying the state.

### 3.2 Unauthorized State Mutation
- **Threat:** A malicious actor attempts to assign themselves the Admin role or resolve confessions.
- **Mitigation:** All restricted endpoint calls enforce authorization via `require_auth()` and role-checking helpers (`is_owner`, `is_admin`, `can_moderate`). Unauthorized calls fail immediately with discrete numeric panic codes (e.g., `2` for `NotAuthorized`).

### 3.3 Spam and Storage Griefing
- **Threat:** A malicious user or bot rapidly sends garbage hashes to `anchor_confession` to bloat the contract's instance storage and exhaust its capacity.
- **Mitigation:**
  1. The API backend currently rate-limits confession submissions and is the only entity submitting anchors.
  2. For direct interaction via the Soroban RPC, the cost of Soroban storage footprint enforces an economic barrier against high-volume griefing. Test suites under `test/adversarial/` (Issue #399) evaluate limits.

### 3.4 Storage Expiration
- **Threat:** The contract's instance storage TTL expires, causing confession hashes to be archived and making them un-verifiable.
- **Mitigation:** The contract relies on automatic TTL extensions per the current protocol standards or regular backend cron jobs to call dummy functions to bump the TTL if required by network upgrades.

## 4. Invariants

The integrity of the XConfess smart contract hinges on these invariants holding true always:
1. `get_confession_count()` monotonically increases.
2. A `verify_confession()` lookup for a successfully anchored hash will always return the unchanging original `timestamp`.
3. Only the `Owner` can modify the administrative access control lists.
4. Calling `initialize()` a second time will reliably panic.
