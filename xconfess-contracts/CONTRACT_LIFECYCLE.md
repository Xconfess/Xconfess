# Contract Lifecycle and Administration Guide

This document provides comprehensive guidance on contract initialization, administration, and lifecycle management for all xConfess smart contracts.

## Table of Contents

- [Overview](#overview)
- [Contract Initialization](#contract-initialization)
- [Administrative Functions](#administrative-functions)
- [Lifecycle Management](#lifecycle-management)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Overview

xConfess platform consists of three main smart contracts:

1. **ConfessionAnchor** - Stores tamper-proof confession hashes
2. **ReputationBadges** - Manages user reputation and badge system
3. **AnonymousTipping** - Handles anonymous tip distribution

Each contract has specific initialization requirements and administrative capabilities.

## Contract Initialization

### ConfessionAnchor Contract

#### Initialization Requirements

```rust
// Initialize the confession anchor contract
pub fn initialize(env: Env, owner: Address) {
    // Sets the contract owner (full administrative control)
    // Initializes the admin set (Map)
    // Sets up access control checks
    // Storage auto-renews via TTL
}
```

#### Required Parameters

- `owner: Address` - The owner address with full administrative control

#### Initialization Process

1. Deploy contract to testnet/mainnet
2. Call `initialize(owner_address)` immediately after deployment
3. Contract configures:
   - Sets specified address as owner
   - Initializes admin set to empty map
   - Prepares version and capability information
   - Enables pause/resume functionality

#### Authorization Model

**Owner Operations** (require owner signature):
- `transfer_owner()` - Transfer ownership to new address
- `grant_admin()` - Add addresses to admin set
- `revoke_admin()` - Remove addresses from admin set
- `pause()` - Block write operations (emergency pause)
- `unpause()` - Resume write operations

**Public Operations** (no authentication required):
- `anchor_confession()` - Submit confession hash (blocks if paused)
- `verify_confession()` - Lookup confession hash
- `get_confession_count()` - Read total anchored count
- `get_owner()` - Read current owner address
- `is_admin()` - Check if address has admin role
- `get_admin_count()` - Count active admins
- `is_paused()` - Check pause status
- `get_version()` - Read version info
- `get_capabilities()` - List supported features

#### Example Initialization

```bash
# 1. Deploy ConfessionAnchor contract
CONTRACT_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/confession_anchor.wasm \
  --source-account $DEPLOYER_KEY \
  --network testnet \
  | jq -r '.contractId')

# 2. Initialize with owner
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $OWNER_KEY \
  -- initialize \
  --owner $OWNER_ADDRESS

# 3. Grant admin roles (optional)
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $OWNER_KEY \
  -- grant_admin \
  --caller $OWNER_ADDRESS \
  --target $ADMIN_ADDRESS

# 4. Verify initialization
stellar contract invoke --id $CONTRACT_ID -- get_owner
stellar contract invoke --id $CONTRACT_ID -- get_admin_count

echo "ConfessionAnchor initialized and ready"
```

### ReputationBadges Contract

#### Initialization Requirements

```rust
// Initialize the reputation badges contract
pub fn init(env: Env, admin: Address) {
    // Sets the contract administrator
    // Initializes badge counter
    // Sets up access control
}
```

#### Required Parameters

- `admin: Address` - Administrator address for badge and reputation management

#### Initialization Process

1. Deploy contract and call `initialize(admin_address)`
2. Contract configures:
   - Sets specified address as admin
   - Initializes badge counter to 0
   - Prepares reputation storage (all users start with 0 reputation)
   - Sets up access control checks

#### Authorization Model

The ReputationBadges contract has two authorization models:

**Admin-Managed Operations** (require admin authorization):
- `initialize()` - Set up the contract admin
- `transfer_admin()` - Change admin
- `create_badge()` - Define badge metadata
- `award_badge()` - Grant badges to users
- `adjust_reputation()` - Adjust user reputation scores

**User-Driven Operations** (user self-authorizes):
- `mint_badge()` - Users self-mint badges they've earned
- `transfer_badge()` - Owner transfers badge to another user
- `revoke_badge()` - Owner revokes their own badge

**Public Operations** (no auth required):
- `get_user_reputation()` - Read user reputation
- `get_badges()` - List user's badges
- `has_badge()` - Check if user has specific badge type
- `get_admin()` - Read current admin

#### Example Initialization

```bash
# 1. Deploy ReputationBadges contract
CONTRACT_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/reputation_badges.wasm \
  --source-account $DEPLOYER_KEY \
  --network testnet \
  | jq -r '.contractId')

# 2. Initialize with admin
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $ADMIN_KEY \
  -- initialize \
  --admin $ADMIN_ADDRESS

# 3. Set up badge types (optional but recommended)
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $ADMIN_KEY \
  -- create_badge \
  --badge_type ConfessionStarter \
  --name "First Confession" \
  --description "Posted your first confession" \
  --criteria "Post at least one confession"

echo "ReputationBadges initialized and ready"
```

### ReputationBadges Administration

#### Badge Management


```rust
// Create new badge type
pub fn create_badge(env: Env, badge_info: BadgeInfo) -> Result<(), Error>

// Update badge criteria
pub fn update_badge_criteria(env: Env, badge_id: u64, criteria: String) -> Result<(), Error>

// Award badge to user
pub fn award_badge(env: Env, user: Address, badge_id: u64) -> Result<(), Error>
```

#### Administrative Capabilities

- **Badge Creation**: Define new reputation badges
- **Criteria Management**: Update badge awarding criteria
- **Badge Awards**: Manually award badges (if required)
- **Reputation Overrides**: Administrative reputation adjustments

### AnonymousTipping Administration

#### Decentralized Design

The AnonymousTipping contract is designed to be fully decentralized with **no administrative functions**:

- No administrator address
- No privileged functions
- No configuration parameters
- Immutable business logic

#### Monitoring Functions

```rust
// Get contract statistics
pub fn latest_settlement_nonce(env: Env) -> u64

// View tip totals
pub fn get_tips(env: Env, recipient: Address) -> i128
```

## Lifecycle Management

### Deployment Phase

#### Pre-Deployment Checklist

- [ ] Review contract code for security vulnerabilities
- [ ] Run comprehensive test suite
- [ ] Verify gas costs are reasonable
- [ ] Test on testnet thoroughly
- [ ] Prepare administrator addresses
- [ ] Document configuration parameters

#### Deployment Steps

1. **Build Contracts**
   ```bash
   cargo build --release --target wasm32-unknown-unknown
   ```

2. **Deploy to Testnet**
   ```bash
   stellar contract deploy --wasm contract.wasm --network testnet --source-account $DEPLOYER_KEY
   ```

3. **Initialize Contracts**
   ```bash
   # For contracts requiring admin
   stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- init --admin $ADMIN_ADDRESS
   ```

4. **Verify Deployment**
   ```bash
   stellar contract info --id $CONTRACT_ID --network testnet
   ```

### Operational Phase

#### Monitoring

Key metrics to monitor:

- **ConfessionAnchor**: Daily confession counts, storage usage
- **ReputationBadges**: Badge awards, reputation distributions
- **AnonymousTipping**: Tip volumes, settlement rates

#### Event Monitoring

All contracts emit structured events:

```rust
// Example event structure
Event {
    topics: ("function_name", "additional_context"),
    data: (timestamp, parameters, result)
}
```

#### Health Checks

Regular health check procedures:

```bash
# Check contract status
stellar contract info --id $CONTRACT_ID --network testnet

# Verify admin functions
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_admin

# Check contract version
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_version
```

### Upgrade Phase

#### Contract Migration

When upgrading contracts:

1. **Data Migration Planning**
   - Identify storage layout changes
   - Plan data migration strategies
   - Prepare rollback procedures

2. **Upgrade Process**
   ```bash
   # Deploy new version
   stellar contract deploy --wasm new_contract.wasm --network testnet
   
   # Migrate data (if required)
   stellar contract invoke --id $NEW_CONTRACT_ID --migrate_from $OLD_CONTRACT_ID
   ```

3. **Verification**
   - Test all functions work correctly
   - Verify data integrity
   - Update frontend integration

#### Backward Compatibility

Maintain compatibility by:

- Preserving existing function signatures
- Using version negotiation
- Supporting deprecated functions during transition
- Providing migration tools

## Security Considerations

### Administrative Security

#### Access Control

- **Principle of Least Privilege**: Admin accounts have minimal required permissions
- **Multi-Sig Consideration**: For high-value contracts, consider multi-signature admin
- **Key Management**: Use hardware wallets for admin keys
- **Rotation Policy**: Regular admin key rotation

#### Audit Trail

All administrative actions should emit events:

```rust
// Example admin event
env.events().publish((
    "admin_action",
    "transfer_admin"
), (
    env.ledger().timestamp(),
    old_admin,
    new_admin,
    caller
));
```

### Operational Security

#### Contract Protection

- **Rate Limiting**: Implement for administrative functions
- **Time Locks**: Consider time delays for critical actions
- **Emergency Controls**: Circuit breakers for abnormal activity

#### Monitoring

Set up monitoring for:

- Unusual administrative activity
- Failed authentication attempts
- Large parameter changes
- Gas consumption anomalies

## Troubleshooting

### Common Issues

#### Initialization Failures

**Problem**: Contract deployment succeeds but initialization fails

**Solutions**:
1. Check administrator address format
2. Verify sufficient XLM balance
3. Ensure correct network configuration
4. Check contract WASM is valid

```bash
# Debug initialization
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $ADMIN_KEY \
  --init \
  --admin $ADMIN_ADDRESS \
  --verbose
```

#### Administrative Access Issues

**Problem**: "Not authorized" errors when calling admin functions

**Solutions**:
1. Verify correct administrator address
2. Check if admin rights were transferred
3. Confirm contract is not paused
4. Verify network matches deployment

```bash
# Check current admin
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_admin

# If incorrect, transfer admin
stellar contract invoke --id $CONTRACT_ID --source-account $CURRENT_ADMIN --transfer_admin $NEW_ADMIN
```

#### Upgrade Issues

**Problem**: Contract upgrade fails or data loss

**Solutions**:
1. Verify data migration completeness
2. Check new contract version compatibility
3. Ensure sufficient gas for migration
4. Test on small subset first

### Emergency Procedures

#### Admin Recovery

If administrator keys are compromised:

1. **Immediate Actions**:
   - Transfer admin rights to new secure address
   - Document the transfer with event logs
   - Notify all relevant parties

2. **Verification**:
   - Test new admin access works
   - Verify old admin access is revoked
   - Update all dependent systems

#### Emergency Pause Management

xConfess contracts use a **unified emergency pause model** managed via the `emergency_pause` module. For detailed specifications, see [EMERGENCY_PAUSE_MODEL.md](EMERGENCY_PAUSE_MODEL.md).

**ConfessionRegistry Pause Flow:**

1. Admin proposes `CriticalAction::Pause` via governance
2. Other admins approve the proposal
3. When quorum is reached, executor calls `gov_execute()`
4. Governance module calls `emergency_pause::set_paused_internal()`
5. All write operations now fail with error code 4 (ContractPaused)
6. Read operations continue normally

**Pause Behavior:**

| Operation | Paused | Running |
|-----------|--------|---------|
| `create_confession()` | ❌ Error 4 | ✅ OK |
| `update_status()` | ❌ Error 4 | ✅ OK |
| `delete_confession()` | ❌ Error 4 | ✅ OK |
| `get_confession()` | ✅ OK | ✅ OK |
| `get_by_hash()` | ✅ OK | ✅ OK |
| `get_author_confessions()` | ✅ OK | ✅ OK |
| `get_total_count()` | ✅ OK | ✅ OK |

**Example: Proposing a Pause**

```bash
# 1. Propose governance action (pause)
stellar contract invoke \
  --id $GOVERNANCE_ID \
  --source-account $ADMIN_KEY \
  -- propose_critical \
  --action Pause \
  --reason "Emergency response: suspected exploit detected"

# 2. Get proposal ID and approve it
PROPOSAL_ID=$(stellar contract invoke \
  --id $GOVERNANCE_ID \
  --source-account $ADMIN_KEY \
  -- get_proposals_count)

# 3. Other admins approve
for APPROVER in $ADMIN_ADDRESSES; do
  stellar contract invoke \
    --id $GOVERNANCE_ID \
    --source-account $APPROVER \
    -- approve_proposal \
    --proposal_id $PROPOSAL_ID
done

# 4. Execute after quorum reached
stellar contract invoke \
  --id $GOVERNANCE_ID \
  --source-account $EXECUTOR_KEY \
  -- execute \
  --proposal_id $PROPOSAL_ID

# 5. Verify pause is active
stellar contract invoke \
  --id $CONFESSION_REGISTRY_ID \
  -- get_pause_status
```

**Other Contracts:**
- **ConfessionAnchor**: No pause (read-only operations)
- **ReputationBadges**: No pause (separate governance model)
- **AnonymousTipping**: No pause (fully decentralized)

## Best Practices

### Development

1. **Comprehensive Testing**: Test all administrative functions
2. **Event Logging**: Emit events for all significant actions
3. **Error Handling**: Provide clear error messages
4. **Documentation**: Keep admin documentation current

### Deployment

1. **Staged Deployment**: Testnet → Staging → Mainnet
2. **Backup Plans**: Have rollback procedures ready
3. **Monitoring**: Set up alerts for contract activity
4. **Documentation**: Document all configuration decisions

### Operations

1. **Regular Audits**: Periodically review administrative actions
2. **Key Rotation**: Regularly update administrator keys
3. **Monitoring**: Track contract performance and usage
4. **Incident Response**: Have procedures for security events

## Additional Resources

- [Stellar Contract Documentation](https://developers.stellar.org/docs/build/smart-contracts)
- [Soroban SDK Reference](https://soroban.stellar.org/docs/)
- [xConfess Contract Repository](https://github.com/xconfess/contracts)
- [Security Audit Reports](../docs/security-audits/)

For specific implementation details, refer to individual contract source files and their respective documentation.
