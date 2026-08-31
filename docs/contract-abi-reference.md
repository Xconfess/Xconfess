# xConfess Contract ABI Reference

> **Version**: 1.0.0  
> **Last Updated**: 2026-03-23  
> **Build Metadata**: `xconfess.confession-anchor+2026-03-23`

This document provides a complete interface reference for all xConfess smart contracts deployed on the Stellar network via Soroban. Each contract section includes data types, function signatures, events, error codes, and invocation examples.

---

## Table of Contents

1. [Version Tagging Strategy](#version-tagging-strategy)
2. [Confession Anchor Contract](#confession-anchor-contract)
3. [Confession Registry Contract](#confession-registry-contract)
4. [Anonymous Tipping Contract](#anonymous-tipping-contract)
5. [Reputation Badges Contract](#reputation-badges-contract)
6. [Cross-Contract Invocation Examples](#cross-contract-invocation-examples)

---

## Version Tagging Strategy

### Semantic Versioning

All contracts follow semantic versioning (MAJOR.MINOR.PATCH) with Soroban build metadata:

```
<major>.<minor>.<patch>+<build-metadata>
```

Example: `1.0.0+xconfess.confession-anchor.2026-03-23`

### Version Constants in Contracts

Each contract exposes its version via `get_version()`:

```rust
pub struct ContractVersionInfo {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub build_metadata: String,
}
```

### Git Tagging Convention

```bash
# Tag format: contracts/<contract-name>/v<major>.<minor>.<patch>
git tag -a contracts/confession-anchor/v1.0.0 -m "Confession Anchor v1.0.0"
git tag -a contracts/confession-registry/v0.1.0 -m "Confession Registry v0.1.0"
git tag -a contracts/anonymous-tipping/v0.1.0 -m "Anonymous Tipping v0.1.0"
git tag -a contracts/reputation-badges/v0.0.0 -m "Reputation Badges v0.0.0"

# Push tags
git push origin --tags
```

### Version Compatibility

Contracts expose compatibility information:

- `get_version()` - Returns semantic version
- `get_capabilities()` - Returns supported capabilities
- `has_capability(symbol)` - Check specific capability
- `can_upgrade_from(major, minor, patch)` - Upgrade compatibility check

---

## Confession Anchor Contract

**Contract Name**: `confession-anchor`  
**Version**: `1.0.0`  
**Build Metadata**: `xconfess.confession-anchor+2026-03-23`  
**Package Version**: `0.1.0`

### Overview

The Confession Anchor contract provides on-chain anchoring of confession content hashes. It records confession hashes with timestamps and ledger sequence numbers, enabling verifiable proof of existence at a specific point in time.

### Data Types

#### ConfessionData

```rust
pub struct ConfessionData {
    pub timestamp: u64,      // Client-provided timestamp (ms since epoch)
    pub anchor_height: u32,  // Ledger sequence number at anchoring
}
```

#### ContractVersionInfo

```rust
pub struct ContractVersionInfo {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub build_metadata: String,
}
```

#### ContractCapabilityInfo

```rust
pub struct ContractCapabilityInfo {
    pub capabilities: Vec<Symbol>,
    pub event_schema_version: u32,
    pub error_registry_version: u32,
}
```

#### UpgradeCompatibilityPolicy

```rust
pub struct UpgradeCompatibilityPolicy {
    pub policy_version: u32,
    pub current_major: u32,
    pub current_minor: u32,
    pub current_patch: u32,
    pub min_supported_from_major: u32,
    pub min_supported_from_minor: u32,
    pub allow_major_upgrade: bool,
}
```

### Storage Keys

```rust
pub enum DataKey {
    Owner,   // Owner address
    Admins,  // Map<Address, ()> - Admin set
}
```

### Capabilities

| Capability | Symbol | Description |
|------------|--------|-------------|
| Anchor V1 | `anchorv1` | Core anchoring functionality |
| Verify V1 | `verifyv1` | Confession verification |
| Count V1 | `countv1` | Confession counting |
| Events V1 | `eventsv1` | Event emission |
| Meta V1 | `meta_v1` | Version/capability metadata |
| Admin V1 | `adminv1` | Admin management |
| Pause V1 | `pausev1` | Emergency pause |

### Functions

#### `initialize(env, owner) -> Result<(), Error>`

Initialize the contract with an owner. Must be called exactly once after deployment.

**Parameters:**
- `env: Env` - Soroban environment
- `owner: Address` - Owner address

**Returns:** `Result<(), Error>`

**Example:**
```javascript
const tx = await contract.initialize({
  owner: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
});
```

---

#### `anchor_confession(env, hash, timestamp) -> Symbol`

Anchor a new confession hash on-chain.

**Parameters:**
- `env: Env` - Soroban environment
- `hash: BytesN<32>` - 32-byte hash of the confession content
- `timestamp: u64` - Client-provided timestamp (ms since epoch)

**Returns:** `Symbol` - `"anchored"` when stored, `"exists"` if already anchored

**Errors:** `ContractPaused` (code 12) if contract is paused

**Example:**
```javascript
const hash = Buffer.from("a1b2c3d4e5f6...".padEnd(64, '0'), 'hex');
const timestamp = BigInt(Date.now());

const result = await contract.anchor_confession({
  hash: hash,
  timestamp: timestamp
});
// Returns: "anchored" or "exists"
```

---

#### `verify_confession(env, hash) -> Option<u64>`

Verify whether a confession hash has been anchored.

**Parameters:**
- `env: Env` - Soroban environment
- `hash: BytesN<32>` - 32-byte hash to verify

**Returns:** `Option<u64>` - `Some(timestamp)` if anchored, `None` otherwise

**Example:**
```javascript
const hash = Buffer.from("a1b2c3d4e5f6...".padEnd(64, '0'), 'hex');

const timestamp = await contract.verify_confession({
  hash: hash
});
// Returns: timestamp (u64) or null
```

---

#### `get_confession_count(env) -> u64`

Return the total number of unique anchored confessions.

**Parameters:**
- `env: Env` - Soroban environment

**Returns:** `u64` - Count of anchored confessions

**Example:**
```javascript
const count = await contract.get_confession_count();
console.log(`Total anchored confessions: ${count}`);
```

---

#### `get_version(env) -> ContractVersionInfo`

Get the contract's semantic version and build metadata.

**Returns:** `ContractVersionInfo`

**Example:**
```javascript
const version = await contract.get_version();
console.log(`Version: ${version.major}.${version.minor}.${version.patch}`);
console.log(`Build: ${version.build_metadata}`);
```

---

#### `get_capabilities(env) -> ContractCapabilityInfo`

Get supported capabilities and schema versions.

**Returns:** `ContractCapabilityInfo`

**Example:**
```javascript
const caps = await contract.get_capabilities();
console.log("Capabilities:", caps.capabilities);
console.log("Event Schema:", caps.event_schema_version);
```

---

#### `has_capability(env, capability) -> bool`

Check if a specific capability is supported.

**Parameters:**
- `capability: Symbol` - Capability to check

**Returns:** `bool`

**Example:**
```javascript
const hasAnchor = await contract.has_capability({
  capability: "anchorv1"
});
```

---

#### `get_upgrade_policy(env) -> UpgradeCompatibilityPolicy`

Get the current upgrade compatibility policy.

**Returns:** `UpgradeCompatibilityPolicy`

---

#### `can_upgrade_from(env, from_major, from_minor, from_patch) -> bool`

Check if upgrade from a specific version is compatible.

**Parameters:**
- `from_major: u32`
- `from_minor: u32`
- `from_patch: u32`

**Returns:** `bool`

---

#### `pause(env, caller, reason) -> Result<(), Error>`

Pause the contract (owner/admin only). Blocks `anchor_confession` writes while preserving read-only verification and count queries.

**Parameters:**
- `caller: Address` - Must be owner or admin
- `reason: String` - Reason for pausing

**Errors:**
- `NotAuthorized` (code 2) when `caller` is not owner/admin
- `AlreadyPaused` (code 9) when the contract is already paused
- `ContractPaused` (code 12) is emitted by blocked write paths such as `anchor_confession` while paused

---

#### `unpause(env, caller, reason) -> Result<(), Error>`

Unpause the contract (owner/admin only). After a successful unpause, `anchor_confession` writes are accepted again.

**Parameters:**
- `caller: Address` - Must be owner or admin
- `reason: String` - Reason for unpausing

**Errors:**
- `NotAuthorized` (code 2) when `caller` is not owner/admin
- `NotPaused` (code 10) when the contract is not currently paused

---

#### Admin Management Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `get_owner` | `(env) -> Result<Address, Error>` | Get current owner |
| `is_admin` | `(env, address) -> bool` | Check if address is admin |
| `is_operator` | `(env, address) -> bool` | Check if address is operator |
| `get_admin_count` | `(env) -> u32` | Count of active admins |
| `get_operator_count` | `(env) -> u32` | Count of active operators |
| `grant_admin` | `(env, caller, target) -> Result<(), Error>` | Grant admin role (owner) |
| `revoke_admin` | `(env, caller, target) -> Result<(), Error>` | Revoke admin role (owner) |
| `transfer_owner` | `(env, caller, new_owner) -> Result<(), Error>` | Transfer ownership |
| `grant_operator` | `(env, caller, target) -> Result<(), Error>` | Grant operator role |
| `revoke_operator` | `(env, caller, target) -> Result<(), Error>` | Revoke operator role |

### Events

#### ConfessionAnchoredEvent
  
  **Topic**: `"confession_anchor"`
  
  ```rust
  pub struct ConfessionAnchoredEvent {
      #[topic]
      pub content_hash: BytesN<32>,
      pub event_version: u32,
      pub nonce: u64,
      pub timestamp: u64,
      pub anchor_height: u32,
  }
  ```
  
  **Fields:**
  - `content_hash`: SHA-256 hash of the confession content
  - `event_version`: Schema version (1)
  - `nonce`: Monotonically increasing counter for ordering
  - `timestamp`: Client-provided timestamp in milliseconds since epoch
  - `anchor_height`: Ledger sequence number at anchoring

#### VersionCompatibilityCheckedEvent
  
  **Topic**: `"version_compatibility_checked"`
  
  ```rust
  pub struct VersionCompatibilityCheckedEvent {
      pub event_version: u32,
      pub nonce: u64,
      pub timestamp: u64,
      pub from_major: u32,
      pub from_minor: u32,
      pub from_patch: u32,
      pub to_major: u32,
      pub to_minor: u32,
      pub to_patch: u32,
      pub compatible: bool,
  }
  ```
  
  **Fields:**
  - `event_version`: Schema version (1)
  - `nonce`: Monotonically increasing counter for ordering
  - `timestamp`: Ledger timestamp in milliseconds since epoch
  - `from_major`, `from_minor`, `from_patch`: Source version
  - `to_major`, `to_minor`, `to_patch`: Target version
  - `compatible`: Whether upgrade is compatible

### Error Codes

| Code | Name | Value | Description |
|------|------|-------|-------------|
| 1 | `NotOwner` | 1 | Caller is not the owner |
| 2 | `NotAuthorized` | 2 | Caller lacks authorization |
| 3 | `AlreadyAdmin` | 3 | Address is already an admin |
| 4 | `NotAdmin` | 4 | Caller is not an admin |
| 5 | `NotInitialized` | 5 | Contract not initialized |
| 6 | `CannotDemoteOwner` | 6 | Cannot remove owner admin rights |
| 7 | `CannotRevokeLastAdmin` | 7 | Cannot revoke last admin |
| 8 | `InvalidOwnershipTransfer` | 8 | Invalid ownership transfer |
| 9 | `AlreadyPaused` | 9 | Contract is already paused |
| 10 | `NotPaused` | 10 | Contract is not paused |
| 11 | `Unauthorized` | 11 | Unauthorized action |
| 12 | `ContractPaused` | 12 | Contract is paused |
| 13 | `AlreadyOperator` | 13 | Address is already an operator |
| 14 | `NotOperator` | 14 | Caller is not an operator |
| 15 | `IncompatibleUpgrade` | 15 | Upgrade version incompatible |

---

## Confession Registry Contract

**Contract Name**: `confession-registry`  
**Version**: `0.1.0`  
**Package Version**: `0.1.0`

### Overview

The Confession Registry contract manages on-chain confession records with full CRUD operations, status tracking, and author-based indexing. It enforces content hash uniqueness and provides replay protection via nonces.

### Data Types

#### ConfessionStatus

```rust
pub enum ConfessionStatus {
    Active,    // Confession is active
    Deleted,   // Confession is soft-deleted
    Flagged,   // Confession is flagged for review
}
```

#### Confession

```rust
pub struct Confession {
    pub id: u64,              // Auto-incrementing ID
    pub author: Address,      // Author's address
    pub content_hash: BytesN<32>,  // 32-byte content hash
    pub created_at: u64,      // Creation timestamp (ms since epoch)
    pub updated_at: u64,      // Last update timestamp (0 if never updated)
    pub status: ConfessionStatus,
}
```

### Storage Keys

```rust
pub enum DataKey {
    NextId,                      // Next confession ID
    Confession(u64),             // Confession by ID
    HashIndex(BytesN<32>),       // content_hash -> confession_id
    AuthorConfessions(Address),  // Author -> Vec<confession_id>
    Admin,                       // Admin address
    CallerNonce(Address),        // Per-caller nonce for replay protection
}
```

### Functions

#### `initialize(env, admin)`

Initialize the contract with an admin address.

**Parameters:**
- `env: Env`
- `admin: Address`

---

#### `create_confession(env, author, content_hash, timestamp) -> u64`

Create a new confession.

**Parameters:**
- `author: Address` - Must authorize
- `content_hash: BytesN<32>` - 32-byte hash
- `timestamp: u64` - Creation timestamp

**Returns:** `u64` - New confession ID

**Example:**
```javascript
const author = "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const hash = Buffer.from("a1b2c3d4e5f6...".padEnd(64, '0'), 'hex');
const timestamp = BigInt(Date.now());

const id = await contract.create_confession({
  author: author,
  content_hash: hash,
  timestamp: timestamp
});
console.log(`Created confession ID: ${id}`);
```

---

#### `create_confession_seq(env, author, content_hash, timestamp, nonce) -> Result<u64, ReplayError>`

Replay-protected confession creation.

**Parameters:**
- `nonce: u64` - Expected nonce for replay protection

---

#### `get_confession(env, id) -> Confession`

Get a confession by ID.

**Parameters:**
- `id: u64`

**Returns:** `Confession`

**Example:**
```javascript
const confession = await contract.get_confession({ id: 1 });
console.log("Author:", confession.author);
console.log("Status:", confession.status);
console.log("Hash:", confession.content_hash);
```

---

#### `get_by_hash(env, content_hash) -> u64`

Get confession ID by content hash.

**Parameters:**
- `content_hash: BytesN<32>`

**Returns:** `u64` - Confession ID

---

#### `get_author_confessions(env, author) -> Vec<u64>`

Get all confession IDs for an author.

**Parameters:**
- `author: Address`

**Returns:** `Vec<u64>` - List of confession IDs

---

#### `get_total_count(env) -> u64`

Get total number of confessions created.

**Returns:** `u64`

---

#### `get_expected_nonce(env, caller) -> u64`

Get the next valid nonce for a caller.

**Parameters:**
- `caller: Address`

**Returns:** `u64`

---

#### `update_status(env, caller, id, new_status, timestamp)`

Update confession status. Only author or admin can update.

**Parameters:**
- `caller: Address` - Must authorize
- `id: u64` - Confession ID
- `new_status: ConfessionStatus` - New status
- `timestamp: u64` - Update timestamp

**Example:**
```javascript
await contract.update_status({
  caller: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  id: 1,
  new_status: { type: "Flagged" },
  timestamp: BigInt(Date.now())
});
```

---

#### `delete_confession(env, caller, id, timestamp)`

Soft-delete a confession (set status to Deleted).

**Parameters:**
- `caller: Address` - Must authorize
- `id: u64`
- `timestamp: u64`

---

### Governance Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `set_quorum` | `(env, threshold: u32)` | Set governance quorum |
| `gov_propose` | `(env, proposer, action) -> u64` | Propose governance action |
| `gov_approve` | `(env, approver, id)` | Approve proposal |
| `gov_revoke` | `(env, actor, id)` | Revoke approval |
| `gov_execute` | `(env, executor, id)` | Execute approved action |

### Events

#### ConfessionCreatedEvent
  
  **Topic**: `"confession_created"`
  
  ```rust
  pub struct ConfessionCreatedEvent {
      #[topic]
      pub id: u64,
      pub event_version: u32,
      pub nonce: u64,
      pub timestamp: u64,
      pub author: Address,
      pub content_hash: BytesN<32>,
      pub correlation_id: Option<Symbol>,
  }
  ```
  
  **Fields:**
  - `id`: Confession ID
  - `event_version`: Schema version (1)
  - `nonce`: Monotonically increasing counter for ordering
  - `timestamp`: Creation timestamp in milliseconds since epoch
  - `author`: Address of confession author
  - `content_hash`: SHA-256 hash of confession content
  - `correlation_id`: Optional correlation ID for cross-contract operations

#### ConfessionUpdatedEvent
  
  **Topic**: `"confession_updated"`
  
  ```rust
  pub struct ConfessionUpdatedEvent {
      #[topic]
      pub id: u64,
      pub event_version: u32,
      pub nonce: u64,
      pub timestamp: u64,
      pub old_status: ConfessionStatus,
      pub new_status: ConfessionStatus,
      pub correlation_id: Option<Symbol>,
  }
  ```
  
  **Fields:**
  - `id`: Confession ID
  - `event_version`: Schema version (1)
  - `nonce`: Monotonically increasing counter for ordering
  - `timestamp`: Update timestamp in milliseconds since epoch
  - `old_status`: Previous confession status
  - `new_status`: New confession status
  - `correlation_id`: Optional correlation ID for cross-contract operations

#### ConfessionDeletedEvent
  
  **Topic**: `"confession_deleted"`
  
  ```rust
  pub struct ConfessionDeletedEvent {
      #[topic]
      pub id: u64,
      pub event_version: u32,
      pub nonce: u64,
      pub timestamp: u64,
      pub actor: Address,
      pub correlation_id: Option<Symbol>,
  }
  ```
  
  **Fields:**
  - `id`: Confession ID
  - `event_version`: Schema version (1)
  - `nonce`: Monotonically increasing counter for ordering
  - `timestamp`: Deletion timestamp in milliseconds since epoch
  - `actor`: Address of user who deleted the confession
  - `correlation_id`: Optional correlation ID for cross-contract operations

### Error Codes

| Code | Name | Value | Description |
|------|------|-------|-------------|
| 1 | `InvalidNonce` | 1 | Nonce mismatch (replay protection) |

---

## Anonymous Tipping Contract

**Contract Name**: `anonymous-tipping`  
**Version**: `0.1.0`  
**Package Version**: `0.1.0`

### Overview

The Anonymous Tipping contract enables sending tips to recipients without revealing the sender's identity. Supports optional settlement proof metadata for off-chain reconciliation.

### Data Types

#### SettlementReceiptEvent / SettlementEvent

```rust
pub struct SettlementEvent {
    pub recipient: Address,
    pub event_version: u32,      // Currently V1 (1)
    pub settlement_id: u64,      // Auto-incrementing ID
    pub amount: i128,            // Tip amount
    pub proof_metadata: String,  // Optional bounded metadata (max 128 chars)
    pub proof_present: bool,     // Whether proof metadata is present
    pub timestamp: u64,          // Ledger timestamp
}
```

### Storage Keys

```rust
enum DataKey {
    RecipientTotal(Address),  // Total tips received by recipient
    SettlementNonce,          // Auto-incrementing settlement ID
}
```

### Constants

```rust
pub const MAX_PROOF_METADATA_LEN: u32 = 128;
```

### Functions

#### `init(env)`

Initialize the tipping contract. Safe to call multiple times.

**Parameters:**
- `env: Env`

**Example:**
```javascript
await contract.init();
```

---

#### `send_tip(env, recipient, amount) -> Result<u64, Error>`

Send an anonymous tip to a recipient.

**Parameters:**
- `recipient: Address` - Tip recipient
- `amount: i128` - Tip amount (must be > 0)

**Returns:** `Result<u64, Error>` - Settlement ID on success

**Example:**
```javascript
const settlementId = await contract.send_tip({
  recipient: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  amount: BigInt(10000000)  // 1 XLM in stroops
});
console.log(`Settlement ID: ${settlementId}`);
```

---

#### `send_tip_with_proof(env, recipient, amount, proof_metadata) -> Result<u64, Error>`

Send a tip with optional bounded settlement proof metadata.

**Parameters:**
- `recipient: Address`
- `amount: i128`
- `proof_metadata: Option<String>` - Max 128 characters

**Returns:** `Result<u64, Error>`

**Example:**
```javascript
const settlementId = await contract.send_tip_with_proof({
  recipient: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  amount: BigInt(10000000),
  proof_metadata: "order_id:12345"  // Optional, max 128 chars
});
```

---

#### `get_tips(env, recipient) -> i128`

Get total tips received by a recipient.

**Parameters:**
- `recipient: Address`

**Returns:** `i128` - Total tip amount

**Example:**
```javascript
const total = await contract.get_tips({
  recipient: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
});
console.log(`Total tips received: ${total} stroops`);
```

---

#### `latest_settlement_nonce(env) -> u64`

Get the latest settlement nonce (for backend indexers).

**Returns:** `u64`

### Events

#### SettlementEvent
  
  **Topic**: `"tip_settled"`
  
  ```rust
  pub struct SettlementEvent {
      #[topic]
      pub recipient: Address,
      pub event_version: u32,
      pub nonce: u64,
      pub timestamp: u64,
      pub settlement_id: u64,
      pub amount: i128,
      pub proof_metadata: String,
      pub proof_present: bool,
  }
  ```
  
  **Fields:**
  - `recipient`: Tip recipient address
  - `event_version`: Schema version (1)
  - `nonce`: Monotonically increasing counter for ordering
  - `timestamp`: Ledger timestamp in milliseconds since epoch
  - `settlement_id`: Auto-incrementing settlement ID
  - `amount`: Tip amount (in stroops)
  - `proof_metadata`: Optional bounded metadata (max 128 chars)
  - `proof_present`: Whether proof metadata is present

### Error Codes

| Code | Name | Value | Description |
|------|------|-------|-------------|
| 1 | `InvalidTipAmount` | 1 | Amount must be > 0 |
| 2 | `MetadataTooLong` | 2 | Proof metadata exceeds 128 chars |
| 3 | `TotalOverflow` | 3 | Recipient total overflow |
| 4 | `NonceOverflow` | 4 | Settlement nonce overflow |

---

## Reputation Badges Contract

**Contract Name**: `reputation-badges`  
**Version**: `0.0.0` (pre-release)  
**Package Version**: `0.0.0`

### Overview

The Reputation Badges contract manages on-chain reputation badges awarded to users for platform achievements. Supports badge minting, transfers, and reputation adjustments.

### Data Types

#### BadgeType

```rust
pub enum BadgeType {
    ConfessionStarter,  // First confession posted
    PopularVoice,       // 100+ reactions received
    GenerousSoul,       // Tipped 10+ confessions
    CommunityHero,      // 50+ confessions posted
    TopReactor,         // 500+ reactions given
}
```

#### BadgeTypeMetadata

```rust
pub struct BadgeTypeMetadata {
    pub name: String,
    pub description: String,
    pub criteria: String,
}
```

#### Badge

```rust
pub struct Badge {
    pub id: u64,
    pub badge_type: BadgeType,
    pub minted_at: u64,
    pub owner: Address,
}
```

#### BadgeAction

```rust
pub enum BadgeAction {
    Grant,
    Revoke,
}
```



### Storage Keys

```rust
pub enum StorageKey {
    BadgeCount,                    // Total badge count
    Badge(u64),                    // Badge by ID
    UserBadges(Address),           // User's badges: Vec<u64>
    TypeOwnership(Address, BadgeType),  // Badge type ownership
    Admin,                         // Admin address
    BadgeTypeMetadata(BadgeType),  // Badge type metadata
    UserReputation(Address),       // User reputation score
}
```

### Functions

#### `initialize(env, admin) -> Result<(), Error>`

Initialize the contract with an admin.

**Parameters:**
- `env: Env`
- `admin: Address` - Must authorize

---

#### `get_admin(env) -> Result<Address, Error>`

Get the current admin address.

---

#### `transfer_admin(env, new_admin) -> Result<(), Error>`

Transfer admin rights to a new address.

**Parameters:**
- `new_admin: Address` - Both current and new admin must authorize

---

#### `create_badge(env, badge_type, name, description, criteria) -> Result<(), Error>`

Create or update metadata for a badge type (admin only).

**Parameters:**
- `badge_type: BadgeType`
- `name: String`
- `description: String`
- `criteria: String`

**Example:**
```javascript
await contract.create_badge({
  badge_type: { type: "ConfessionStarter" },
  name: "Confession Starter",
  description: "Awarded for posting your first confession",
  criteria: "Post 1 confession"
});
```

---

#### `award_badge(env, recipient, badge_type) -> Result<u64, Error>`

Award a badge to a user (admin only).

**Parameters:**
- `recipient: Address`
- `badge_type: BadgeType`

**Returns:** `Result<u64, Error>` - Badge ID

**Example:**
```javascript
const badgeId = await contract.award_badge({
  recipient: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  badge_type: { type: "ConfessionStarter" }
});
console.log(`Awarded badge ID: ${badgeId}`);
```

---

#### `mint_badge(env, recipient, badge_type) -> Result<u64, Error>`

Mint a badge (self-service, recipient authorizes).

**Parameters:**
- `recipient: Address` - Must authorize
- `badge_type: BadgeType`

**Returns:** `Result<u64, Error>`

---

#### `get_badges(env, owner) -> Vec<Badge>`

Get all badges owned by an address.

**Parameters:**
- `owner: Address`

**Returns:** `Vec<Badge>`

**Example:**
```javascript
const badges = await contract.get_badges({
  owner: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
});
badges.forEach(badge => {
  console.log(`Badge ID: ${badge.id}, Type: ${badge.badge_type}`);
});
```

---

#### `has_badge(env, owner, badge_type) -> bool`

Check if an owner has a specific badge type.

**Parameters:**
- `owner: Address`
- `badge_type: BadgeType`

**Returns:** `bool`

---

#### `get_badge_count(env, owner) -> u32`

Get the total number of badges owned by an address.

---

#### `get_badge(env, badge_id) -> Option<Badge>`

Get a specific badge by ID.

---

#### `transfer_badge(env, badge_id, to) -> Result<(), Error>`

Transfer a badge to another address.

**Parameters:**
- `badge_id: u64`
- `to: Address` - Current owner must authorize

---

#### `get_total_badges(env) -> u64`

Get total number of badges minted.

---

#### `adjust_reputation(env, user, amount, reason) -> Result<i128, Error>`

Adjust user reputation (admin only).

**Parameters:**
- `user: Address`
- `amount: i128` - Can be positive or negative
- `reason: String`

**Returns:** `Result<i128, Error>` - New reputation score

---

#### `get_user_reputation(env, user) -> i128`

Get user reputation score.

**Parameters:**
- `user: Address`

**Returns:** `i128`

**Example:**
```javascript
const rep = await contract.get_user_reputation({
  user: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
});
console.log(`User reputation: ${rep}`);
```

### Events

| Event Topic | Data Type | Description |
|-------------|-----------|-------------|
| `contract_initialized` | `(admin)` | Contract initialized |
| `admin_transferred` | `(old_admin, new_admin)` | Admin transferred |
| `badge_type_created` | `(admin, badge_type)` | Badge type created |
| `badge_awarded` | `BadgeEvent` | Badge awarded by admin |
| `badge_granted` | `BadgeEvent` | Badge granted (self-service) |
| `badge_transferred` | `BadgeTransferredData` | Badge transferred |
| `reputation_adjusted` | `ReputationAdjustedData` | Reputation changed |

### Error Codes

| Code | Name | Value | Description |
|------|------|-------|-------------|
| 1 | `BadgeAlreadyOwned` | 1 | User already owns this badge type |
| 2 | `BadgeNotFound` | 2 | Badge not found |
| 3 | `BadgeTypeAlreadyOwned` | 3 | Recipient already owns badge type (transfer) |
| 4 | `NotAuthorized` | 4 | Caller not authorized |
| 5 | `NotInitialized` | 5 | Contract not initialized |
| 6 | `BadgeTypeMetadataNotFound` | 6 | Badge type metadata not found |

---

## Cross-Contract Invocation Examples

### Complete Confession Flow

```javascript
// 1. Initialize contracts (one-time setup)
await anchorContract.initialize({ owner: adminAddress });
await registryContract.initialize({ admin: adminAddress });
await tippingContract.init();
await badgesContract.initialize({ admin: adminAddress });

// 2. Create badge types
await badgesContract.create_badge({
  badge_type: { type: "ConfessionStarter" },
  name: "Confession Starter",
  description: "First confession",
  criteria: "Post 1 confession"
});

// 3. User creates a confession
const contentHash = Buffer.from(sha256(content).padEnd(64, '0'), 'hex');
const timestamp = BigInt(Date.now());

// Anchor the confession hash
const anchorResult = await anchorContract.anchor_confession({
  hash: contentHash,
  timestamp: timestamp
});

// Register the confession
const confessionId = await registryContract.create_confession({
  author: userAddress,
  content_hash: contentHash,
  timestamp: timestamp
});

// Award badge if first confession
const badgeId = await badgesContract.award_badge({
  recipient: userAddress,
  badge_type: { type: "ConfessionStarter" }
});

// 4. Tip the confession author
const settlementId = await tippingContract.send_tip({
  recipient: authorAddress,
  amount: BigInt(5000000)  // 0.5 XLM
});

// 5. Verify anchoring
const anchoredTimestamp = await anchorContract.verify_confession({
  hash: contentHash
});
console.log("Anchored at:", anchoredTimestamp);
```

### Batch Query Example

```javascript
// Get user's confessions and badges
const confessionIds = await registryContract.get_author_confessions({
  author: userAddress
});

const badges = await badgesContract.get_badges({
  owner: userAddress
});

const reputation = await badgesContract.get_user_reputation({
  user: userAddress
});

console.log({
  confessionCount: confessionIds.length,
  badges: badges.length,
  reputation: reputation
});
```

### Version Check Before Interaction

```javascript
// Check contract version and capabilities
const version = await anchorContract.get_version();
const caps = await anchorContract.get_capabilities();

console.log(`Contract version: ${version.major}.${version.minor}.${version.patch}`);

if (await anchorContract.has_capability({ capability: "anchorv1" })) {
  // Proceed with anchoring
  await anchorContract.anchor_confession({ hash, timestamp });
} else {
  console.error("Contract does not support anchoring");
}
```

---

## Public Event Schema Fixtures

The contract test suite validates these public event fixture names and field
orders against this reference. Keep this section aligned with
`xconfess-contracts/contracts/events.rs` whenever event payloads change.

| Event | Category | Topic | Data format | Field order |
| --- | --- | --- | --- | --- |
| `ConfessionAnchoredEvent` | `anchor` | `confession_anchor` | `vec` | `event_version`, `timestamp`, `anchor_height` |
| `VersionCompatibilityCheckedEvent` | `anchor` | `version_compatibility_checked` | `vec` | `event_version`, `nonce`, `timestamp`, `from_major`, `from_minor`, `from_patch`, `to_major`, `to_minor`, `to_patch`, `compatible` |
| `SettlementEvent` | `tip` | `tip_settl` | `single-value` | `recipient`, `event_version`, `settlement_id`, `amount`, `proof_metadata`, `proof_present`, `timestamp` |
| `ConfessionEvent` | `confession` | `confess` | `single-value` | `event_version`, `confession_id`, `author`, `content_hash`, `nonce`, `timestamp`, `correlation_id` |
| `ReactionEvent` | `reaction` | `react` | `single-value` | `event_version`, `confession_id`, `reactor`, `reaction_type`, `nonce`, `timestamp`, `correlation_id` |
| `PauseChangedEvent` | `pause` | `tip_pause` | `single-value` | `actor`, `paused`, `reason`, `timestamp` |
| `ReportEvent` | `report` | `report` | `single-value` | `event_version`, `confession_id`, `reporter`, `reason`, `nonce`, `timestamp`, `correlation_id` |
| `ReportSubmittedLedgerEvent` | `report` | `report` | `single-value` | `confession_id`, `actor`, `reason`, `event_version`, `nonce`, `timestamp` |
| `RoleEvent` | `role` | `role` | `single-value` | `event_version`, `user`, `role`, `granted`, `nonce`, `timestamp`, `correlation_id` |
| `GovernanceEvent` | `governance` | `<stream>` | `single-value` | `event_version`, `metadata`, `nonce`, `timestamp` |
| `GovernanceProposedEvent` | `governance` | `gov_prop` | `single-value` | `proposal_id`, `proposer` |
| `GovernanceApprovedEvent` | `governance` | `gov_app` | `single-value` | `proposal_id`, `approver` |
| `GovernanceApprovalRevokedEvent` | `governance` | `gov_rev` | `single-value` | `proposal_id`, `actor` |
| `GovernanceExecutedEvent` | `governance` | `gov_exec` | `single-value` | `proposal_id`, `executor` |
| `GovInvariantViolationEvent` | `governance` | `gov_inv` | `single-value` | `nonce`, `timestamp`, `operation`, `reason`, `attempted_by` |
| `BadgeEvent` | `reputation` | `badge` | `single-value` | `event_version`, `badge_id`, `badge_type`, `owner`, `action`, `nonce`, `timestamp` |
| `BadgeEvent` | `reputation` | `badge_awarded` | `single-value` | `event_version`, `badge_id`, `badge_type`, `owner`, `action`, `timestamp` |
| `BadgeEvent` | `reputation` | `badge_granted` | `single-value` | `event_version`, `badge_id`, `badge_type`, `owner`, `action`, `timestamp` |
| `BadgeEvent` | `reputation` | `badge_revoked` | `single-value` | `event_version`, `badge_id`, `badge_type`, `owner`, `action`, `timestamp` |
| `ReputationAdjustedData` | `reputation` | `reputation_adjusted` | `single-value` | `user`, `amount`, `reason`, `timestamp` |
| `ReputationDecayedData` | `reputation` | `reputation_decayed` | `single-value` | `user`, `old_reputation`, `new_reputation`, `epochs_applied`, `timestamp` |

---

## Document Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-23 | Initial ABI reference for all contracts |

---

## References

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [xConfess Project README](../README.md)
- [Contract Deployment Guide](./SOROBAN_SETUP.md)
- [Release Runbook](./contract-release-and-upgrade-runbook.md)
- [Backend Event Parser Compatibility Layer](./contract-event-parser-compatibility.md)
