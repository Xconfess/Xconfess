# Event Schemas and Naming Conventions

> **Version**: 1.0.0  
> **Last Updated**: 2026-04-24  
> **Status**: Draft

## Overview

This document defines the standardized event naming conventions and payload structures for all Xconfess smart contracts. These conventions ensure consistency across contracts and provide clear, predictable schemas for off-chain indexers and event processors.

> **Bumping `event_version` or fixtures?** Use the [Contract Event Version Bump Checklist](./contract-event-version-bump-checklist.md) before opening a PR. It lists required contract files, backend fixture tests, and changelog steps.

## Shared Event Conventions

### Naming Conventions

#### Event Type Names
- Use **PascalCase** for event struct names (e.g., `ConfessionCreated`, `AdminGranted`)
- Use **snake_case** for event topic strings (e.g., `"confession_created"`, `"admin_granted"`)
- Event names should clearly describe the action that occurred (past tense or state change)
- Avoid abbreviations except for well-known terms (e.g., `ID`, `URI`)

#### Topic Naming
- Topics should be descriptive and consistent across contracts
- Use singular nouns for resource types
- Use past tense verbs for action events (e.g., `created`, `updated`, `deleted`)
- Use state names for state change events (e.g., `paused`, `unpaused`)

### Payload Structure Conventions

#### Common Fields

All events SHOULD include the following fields where applicable:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_version` | `u32` | ✓ | Event schema version (starts at 1) |
| `nonce` | `u64` | ✓ | Monotonically increasing counter for ordering |
| `timestamp` | `u64` | ✓ | Ledger timestamp in milliseconds since epoch |
| `correlation_id` | `Option<Symbol>` | ✗ | Optional correlation ID for cross-contract operations |

#### Field Naming Conventions

| Concept | Field Name | Type | Description |
|---------|------------|------|-------------|
| Unique identifier | `id` | `u64` | Generic ID field |
| Entity identifier | `{entity}_id` | `u64` | Specific entity ID (e.g., `proposal_id`, `settlement_id`) |
| Content hash | `content_hash` | `BytesN<32>` | SHA-256 hash of content |
| User/actor address | `user` or `actor` | `Address` | User performing the action |
| Author/Creator | `author` | `Address` | Original creator of content |
| Owner | `owner` | `Address` | Current owner of an entity |
| Previous value | `old_{field}` | varies | Previous value before change |
| New value | `new_{field}` | varies | New value after change |
| Status | `status` | `Enum` | Current status |
| Amount | `amount` | `i128` | Token amount (in smallest unit) |
| Metadata | `metadata` | `String` | Additional data |

#### Data Format

- Use `data_format = "vec"` for events with multiple fields or complex types
- Use `data_format = "single-value"` for simple events with one primary field
- All events should derive `Clone`, `Debug`, `Eq`, `PartialEq`

## Contract-Specific Event Schemas

### 1. Confession Anchor Contract

#### ConfessionAnchored
- **Topic**: `"confession_anchor"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["confession_anchor"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
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
- `nonce`: Monotonically increasing counter
- `timestamp`: Client-provided timestamp in milliseconds
- `anchor_height`: Ledger sequence number at anchoring

#### VersionCompatibilityChecked
- **Topic**: `"version_compatibility_checked"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["version_compatibility_checked"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
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

### 2. Confession Registry Contract

#### ConfessionCreated
- **Topic**: `"confession_created"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["confession_created"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
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

#### ConfessionUpdated
- **Topic**: `"confession_updated"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["confession_updated"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
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

#### ConfessionDeleted
- **Topic**: `"confession_deleted"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["confession_deleted"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
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

### 3. Anonymous Tipping Contract

#### TipSettled
- **Topic**: `"tip_settled"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["tip_settled"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TipSettledEvent {
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

### 4. Reputation Badges Contract

#### BadgeGranted
- **Topic**: `"badge_granted"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["badge_granted"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BadgeGrantedEvent {
    #[topic]
    pub badge_id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub badge_type: u32,
    pub owner: Address,
    pub action: BadgeAction,
}
```

### 5. Emergency Pause Contract

#### ContractPaused
- **Topic**: `"contract_paused"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["contract_paused"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractPausedEvent {
    #[topic]
    pub actor: Address,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub reason: String,
}
```

#### ContractUnpaused
- **Topic**: `"contract_unpaused"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["contract_unpaused"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUnpausedEvent {
    #[topic]
    pub actor: Address,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub reason: String,
}
```

### 6. Access Control Events

#### AdminGranted
- **Topic**: `"admin_granted"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["admin_granted"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminGrantedEvent {
    #[topic]
    pub address: Address,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
}
```

#### AdminRevoked
- **Topic**: `"admin_revoked"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["admin_revoked"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminRevokedEvent {
    #[topic]
    pub address: Address,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
}
```

#### OwnershipTransferred
- **Topic**: `"ownership_transferred"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["ownership_transferred"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferredEvent {
    #[topic]
    pub new_owner: Address,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub previous_owner: Address,
}
```

### 7. Governance Events

#### GovernanceProposed
- **Topic**: `"governance_proposed"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["governance_proposed"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceProposedEvent {
    #[topic]
    pub proposal_id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub proposer: Address,
}
```

#### GovernanceApproved
- **Topic**: `"governance_approved"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["governance_approved"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceApprovedEvent {
    #[topic]
    pub proposal_id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub approver: Address,
}
```

#### GovernanceApprovalRevoked
- **Topic**: `"governance_approval_revoked"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["governance_approval_revoked"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceApprovalRevokedEvent {
    #[topic]
    pub proposal_id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub actor: Address,
}
```

#### GovernanceExecuted
- **Topic**: `"governance_executed"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["governance_executed"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceExecutedEvent {
    #[topic]
    pub proposal_id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub executor: Address,
}
```

#### GovernanceInvariantViolation
- **Topic**: `"governance_invariant_violation"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["governance_invariant_violation"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceInvariantViolationEvent {
    #[topic]
    pub nonce: u64,
    pub event_version: u32,
    pub timestamp: u64,
    pub operation: String,
    pub reason: String,
    pub attempted_by: Address,
}
```

### 8. Role Events

#### RoleGranted
- **Topic**: `"role_granted"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["role_granted"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleGrantedEvent {
    #[topic]
    pub user: Address,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub role: Symbol,
    pub granted: bool,
    pub correlation_id: Option<Symbol>,
}
```

### 9. Reaction Events

#### ReactionAdded
- **Topic**: `"reaction_added"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["reaction_added"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReactionAddedEvent {
    #[topic]
    pub confession_id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub reactor: Address,
    pub reaction_type: Symbol,
    pub correlation_id: Option<Symbol>,
}
```

### 10. Report Events

#### ReportSubmitted
- **Topic**: `"report_submitted"`
- **Data Format**: `"vec"`
- **Version**: 1

```rust
#[contractevent(topics = ["report_submitted"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReportSubmittedEvent {
    #[topic]
    pub confession_id: u64,
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub reporter: Address,
    pub reason: Symbol,
    pub correlation_id: Option<Symbol>,
}
```

## Migration Guide

### For Indexers

When migrating to the new event schemas:

1. **Update topic names** to use the new standardized names
2. **Add event_version field** to all event processors
3. **Add nonce field** for proper event ordering
4. **Standardize field names** (e.g., `caller` → `actor`, `id` remains `id`)
5. **Add timestamp field** where missing

### Backward Compatibility

- Maintain `EVENT_SCHEMA_VERSION` constant in each contract
- Use version checking in event processors
- Support both old and new event formats during transition period
- Document breaking changes clearly

## Best Practices for Event Emission

1. **Always include event_version**: Allows for schema evolution
2. **Use nonces for ordering**: Ensures correct event sequence
3. **Include timestamps**: Provides temporal context
4. **Use descriptive topic names**: Makes filtering easier
5. **Keep events immutable**: Once emitted, events should never change
6. **Document all events**: Include in contract ABI reference
7. **Test event emission**: Verify events are emitted correctly in tests

## Indexer Recommendations

### Event Filtering

```javascript
// Filter for specific event types
const confessionCreatedFilter = {
    topics: ["confession_created"],
    dataFormat: "vec"
};

// Filter by contract address and event type
const filters = [
    {
        contract: CONFESSION_REGISTRY_ADDRESS,
        topics: ["confession_created", "confession_updated"]
    }
];
```

### Event Processing

```javascript
async function processEvent(event) {
    // Check event version for compatibility
    if (event.event_version > CURRENT_VERSION) {
        throw new Error(`Unsupported event version: ${event.event_version}`);
    }
    
    // Process based on event type
    switch (event.topic) {
        case "confession_created":
            await handleConfessionCreated(event);
            break;
        case "confession_updated":
            await handleConfessionUpdated(event);
            break;
        // ... other event types
    }
}
```

### Schema Validation

```javascript
function validateEventSchema(event, expectedSchema) {
    const requiredFields = expectedSchema.required || [];
    for (const field of requiredFields) {
        if (!(field in event)) {
            throw new Error(`Missing required field: ${field}`);
        }
    }
    return true;
}
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-24 | Initial event schema standardization |
