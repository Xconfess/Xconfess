# Contract Administration Guide

Practical guide for administrators managing xConfess smart contracts in production environments.

## Quick Reference

### Common Administrative Commands

```bash
# Check contract status
stellar contract info --id $CONTRACT_ID --network $NETWORK

# Get current administrator
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_admin

# Transfer administrator rights
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- transfer_admin --new_admin $NEW_ADMIN_ADDRESS

# Check contract version
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_version
```

### Environment Setup

```bash
# Required environment variables
export STELLAR_NETWORK="testnet"  # or "mainnet"
export ADMIN_KEY="your-admin-secret-key"
export CONTRACT_ID="your-contract-id"

# Optional for multiple contracts
export CONFESSION_ANCHOR_ID="confession-contract-id"
export REPUTATION_BADGES_ID="reputation-contract-id"
export ANONYMOUS_TIPPING_ID="tipping-contract-id"
```

## Contract-Specific Administration

### ConfessionAnchor Contract

#### Initialization

```bash
# Initialize the contract with an owner (called immediately after deployment)
stellar contract invoke \
  --id $CONFESSION_ANCHOR_ID \
  --source-account $OWNER_KEY \
  -- initialize \
  --owner $OWNER_ADDRESS
```

#### Daily Operations

```bash
# Check confession statistics
stellar contract invoke --id $CONFESSION_ANCHOR_ID -- get_confession_count

# Monitor recent activity
stellar contract events --id $CONFESSION_ANCHOR_ID --limit 100 --topic "confession_anchor"

# Check current owner
stellar contract invoke --id $CONFESSION_ANCHOR_ID -- get_owner

# Check if contract is paused
stellar contract invoke --id $CONFESSION_ANCHOR_ID -- is_paused
```

#### Administrative Functions

| Function | Purpose | Required Role |
|-----------|---------|--------------|
| `transfer_owner` | Change contract owner | Current Owner |
| `grant_admin` | Grant admin role | Owner |
| `revoke_admin` | Remove admin role | Owner |
| `get_owner` | View current owner | Any |
| `is_admin` | Check if address is admin | Any |
| `get_admin_count` | Count active admins | Any |
| `pause` | Block write operations | Owner |
| `unpause` | Resume write operations | Owner |
| `is_paused` | Check pause status | Any |
| `get_version` | Check contract version | Any |
| `get_capabilities` | View supported features | Any |

#### Example: Owner Transfer

```bash
# Step 1: Verify current owner
CURRENT_OWNER=$(stellar contract invoke --id $CONFESSION_ANCHOR_ID -- get_owner --json | jq -r '.result.ok')

# Step 2: Transfer ownership
stellar contract invoke \
  --id $CONFESSION_ANCHOR_ID \
  --source-account $OWNER_KEY \
  -- transfer_owner \
  --caller $OWNER_ADDRESS \
  --new_owner $NEW_OWNER_ADDRESS

# Step 3: Verify transfer
NEW_OWNER=$(stellar contract invoke --id $CONFESSION_ANCHOR_ID -- get_owner --json | jq -r '.result.ok')
echo "Owner transferred from $CURRENT_OWNER to $NEW_OWNER"
```

#### Admin Management

```bash
# Grant admin role
stellar contract invoke \
  --id $CONFESSION_ANCHOR_ID \
  --source-account $OWNER_KEY \
  -- grant_admin \
  --caller $OWNER_ADDRESS \
  --target $NEW_ADMIN_ADDRESS

# Check if address is admin
stellar contract invoke --id $CONFESSION_ANCHOR_ID -- is_admin --address $ADMIN_ADDRESS

# Get active admin count
stellar contract invoke --id $CONFESSION_ANCHOR_ID -- get_admin_count

# Revoke admin role
stellar contract invoke \
  --id $CONFESSION_ANCHOR_ID \
  --source-account $OWNER_KEY \
  -- revoke_admin \
  --caller $OWNER_ADDRESS \
  --target $ADMIN_ADDRESS
```

#### Pause/Unpause Management

```bash
# Pause the contract (blocks new confession anchoring, allows reads)
stellar contract invoke \
  --id $CONFESSION_ANCHOR_ID \
  --source-account $OWNER_KEY \
  -- pause \
  --caller $OWNER_ADDRESS \
  --reason "Emergency response: system maintenance"

# Verify pause status
stellar contract invoke --id $CONFESSION_ANCHOR_ID -- is_paused

# While paused, read operations still work:
stellar contract invoke --id $CONFESSION_ANCHOR_ID -- verify_confession --hash 0x...
stellar contract invoke --id $CONFESSION_ANCHOR_ID -- get_confession_count

# Resume operations when ready
stellar contract invoke \
  --id $CONFESSION_ANCHOR_ID \
  --source-account $OWNER_KEY \
  -- unpause \
  --caller $OWNER_ADDRESS \
  --reason "Maintenance complete, resuming normal operations"
```

#### Pause Behavior

| Operation | While Paused |
|-----------|-------------|
| `anchor_confession()` | ❌ Blocked (error code 4) |
| `verify_confession()` | ✅ Allowed |
| `get_confession_count()` | ✅ Allowed |
| `get_version()` | ✅ Allowed |
| `get_capabilities()` | ✅ Allowed |

Read operations remain available to maintain visibility into contract state during maintenance or emergency windows.

### ReputationBadges Contract

#### Initialization

```bash
# Initialize the contract with an admin
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ADMIN_KEY -- \
  initialize \
  --admin $ADMIN_ADDRESS
```

#### Badge Type Management

```bash
# Define badge metadata (admin only)
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ADMIN_KEY -- \
  create_badge \
  --badge_type ConfessionStarter \
  --name "First Confession" \
  --description "Your first confession was posted" \
  --criteria "Post at least one confession"

stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ADMIN_KEY -- \
  create_badge \
  --badge_type PopularVoice \
  --name "Popular Voice" \
  --description "Your confessions resonated with 100+ people" \
  --criteria "Receive 100+ reactions"

# Supported badge types:
# - ConfessionStarter
# - PopularVoice
# - GenerousSoul
# - CommunityHero
# - TopReactor
```

#### Badge Award Management

```bash
# Award a badge to a user (admin only - recipient does not need to authorize)
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ADMIN_KEY -- \
  award_badge \
  --recipient $USER_ADDRESS \
  --badge_type PopularVoice

# Check what badges a user owns
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ANY_KEY -- \
  get_badges --owner $USER_ADDRESS

# Check if user has a specific badge type
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ANY_KEY -- \
  has_badge --owner $USER_ADDRESS --badge_type ConfessionStarter

# Get badge count for user
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ANY_KEY -- \
  get_badge_count --owner $USER_ADDRESS
```

#### Reputation Management

```bash
# Check user reputation
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ANY_KEY -- \
  get_user_reputation --user $USER_ADDRESS

# Adjust user reputation (admin only) - positive or negative
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ADMIN_KEY -- \
  adjust_reputation \
  --user $USER_ADDRESS \
  --amount 100 \
  --reason "Exceptional community contribution"

# Negative adjustment for policy violations
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ADMIN_KEY -- \
  adjust_reputation \
  --user $REPORTED_USER \
  --amount -50 \
  --reason "Policy violation: inappropriate content"
```

#### Admin Management

```bash
# Get current admin
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ANY_KEY -- \
  get_admin

# Transfer admin rights (current admin and new admin must authorize)
stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $CURRENT_ADMIN_KEY -- \
  transfer_admin --new_admin $NEW_ADMIN_ADDRESS
```

#### Authorization Model

| Function | Required Role | Requires Auth |
|----------|--------------|---------------|
| `initialize` | None (one-time) | Yes (admin autho-rizes) |
| `get_admin` | Public | No |
| `transfer_admin` | Current admin | Yes (both parties) |
| `create_badge` | Admin only | Yes |
| `award_badge` | Admin only | Yes |
| `mint_badge` | Any user | Yes (self-auth) |
| `get_user_reputation` | Public | No |
| `adjust_reputation` | Admin only | Yes |
| `transfer_badge` | Badge owner | Yes (owner auth) |
| `revoke_badge` | Badge owner | Yes (owner auth) |

Note: `mint_badge` allows users to self-mint badges they've earned without admin involvement, while `award_badge` is admin-driven for community management and off-chain verification.


### ConfessionRegistry Contract

#### Daily Operations

```bash
# Check confession statistics
stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $ANY_KEY -- \
  get_total_count

# Monitor creation activity
stellar contract events --id $CONFESSION_REGISTRY_ID --limit 100 --topic "confession_created"

# Check user confessions
stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $ANY_KEY -- \
  get_author_confessions --author $USER_ADDRESS
```

#### Pause/Unpause Management

Pausing is handled through **governance proposals** (not direct admin calls). All write operations are blocked while paused; read operations remain available.

```bash
# Propose pause action (requires admin authorization and approval quorum)
PROPOSAL_ID=$(stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $ADMIN_KEY -- \
  gov_propose \
  --proposer $ADMIN_ADDRESS \
  --action Pause | jq '.proposal_id')

echo "Pause proposal $PROPOSAL_ID created (waiting for approval)"

# Admin approves the pause proposal
stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $APPROVER_KEY -- \
  gov_approve \
  --approver $APPROVER_ADDRESS \
  --id $PROPOSAL_ID

# Execute the pause after quorum is reached
stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $EXECUTOR_KEY -- \
  gov_execute \
  --executor $EXECUTOR_ADDRESS \
  --id $PROPOSAL_ID

echo "Contract is now paused - write operations blocked, reads still available"

# Similar process to unpause using CriticalAction::Unpause
UNPAUSE_PROPOSAL=$(stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $ADMIN_KEY -- \
  gov_propose \
  --proposer $ADMIN_ADDRESS \
  --action Unpause | jq '.proposal_id')

# Approve and execute unpause proposal
```

#### Pause Behavior

| Operation | While Paused |
|-----------|-------------|
| `create_confession()` | ❌ Blocked |
| `update_status()` | ❌ Blocked |
| `delete_confession()` | ❌ Blocked |
| `get_confession()` | ✅ Allowed |
| `get_by_hash()` | ✅ Allowed |
| `get_author_confessions()` | ✅ Allowed |
| `get_total_count()` | ✅ Allowed |

Read operations remain available while paused, maintaining visibility into contract state during maintenance or emergency windows.

#### Administrative Functions

| Function | Purpose | Required Role |
|----------|---------|--------------|
| `initialize` | Set contract admin | None (on deployment) |
| `gov_propose` | Propose critical action | Admin/Authorized |
| `gov_approve` | Approve proposal | Admin/Authorized |
| `gov_execute` | Execute approved proposal | Any |
| `set_quorum` | Set approval threshold | Owner |

The governance system ensures no single admin can pause arbitrarily—approval from other admins is required based on quorum settings.


### AnonymousTipping Contract

#### Monitoring Only

The AnonymousTipping contract has no administrative functions - it's fully decentralized.

```bash
# Monitor tip activity
stellar contract events --id $ANONYMOUS_TIPPING_ID --limit 50 --topic "tip_settl"

# Check total tips for address
stellar contract invoke --id $ANONYMOUS_TIPPING_ID --source-account $ANY_KEY -- \
  get_tips --recipient $USER_ADDRESS

# View latest settlement
stellar contract invoke --id $ANONYMOUS_TIPPING_ID --source-account $ANY_KEY -- \
  latest_settlement_nonce
```

## Security Operations

### Administrator Key Management

#### Key Rotation Procedure

```bash
# 1. Generate new admin key
stellar keys generate --name new-admin-$(date +%Y%m%d)

# 2. Fund new account on testnet
stellar network fund new-admin-$(date +%Y%m%d) --network testnet

# 3. Transfer admin rights (from old admin)
stellar contract invoke --id $CONTRACT_ID --source-account $OLD_ADMIN_KEY -- \
  transfer_admin --new_admin $NEW_ADMIN_ADDRESS

# 4. Verify transfer
stellar contract invoke --id $CONTRACT_ID --source-account $NEW_ADMIN_SECRET -- get_admin

# 5. Update environment variables
export ADMIN_KEY=$NEW_ADMIN_SECRET
```

#### Multi-Signature Setup (Optional)

For high-security deployments:

```bash
# Multi-sig admin setup example
MULTISIG_ADDRESS="MXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Configure contract with multi-sig admin
stellar contract invoke --id $CONTRACT_ID --source-account $CURRENT_ADMIN -- \
  transfer_admin --new_admin $MULTISIG_ADDRESS
```

### Emergency Procedures

#### Compromise Response

```bash
# Emergency: Transfer admin to safe address
SAFE_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

stellar contract invoke --id $CONTRACT_ID --source-account $COMPROMISED_ADMIN_KEY -- \
  transfer_admin --new_admin $SAFE_ADDRESS

# Verify transfer completed
stellar contract invoke --id $CONTRACT_ID --source-account $SAFE_ADMIN_SECRET -- get_admin
```

### Emergency Response: Pause Contract

The ConfessionRegistry contract supports emergency pause via governance to block all write operations during incidents or maintenance.

```bash
# EMERGENCY: Fast-track pause via governance
# Step 1: Propose pause
PAUSE_ID=$(stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $ADMIN_KEY -- \
  gov_propose \
  --proposer $ADMIN_ADDRESS \
  --action Pause | jq '.proposal_id')

# Step 2: Admin approval(s)
stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $APPROVER1_KEY -- \
  gov_approve --approver $APPROVER1 --id $PAUSE_ID

stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $APPROVER2_KEY -- \
  gov_approve --approver $APPROVER2 --id $PAUSE_ID

# Step 3: Execute (anyone can execute after quorum reached)
stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $EXECUTOR_KEY -- \
  gov_execute --executor $EXECUTOR_ADDRESS --id $PAUSE_ID

# Verify pause is active
stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $ANY_KEY -- is_paused

# Reads still work during pause for monitoring
stellar contract invoke --id $CONFESSION_REGISTRY_ID --source-account $ANY_KEY -- \
  get_total_count

# When resolved, unpause using same governance flow with CriticalAction::Unpause
```

**Note:** Pause requires governance approval (typically 50%+ of admins). This prevents individual admin abuse. Is there a lower-level emergency pause for immediate response?


## Monitoring and Alerting

### Setting Up Monitoring

#### Event Monitoring Script

```bash
#!/bin/bash
# monitor-contracts.sh

CONTRACTS="$CONFESSION_ANCHOR_ID $REPUTATION_BADGES_ID $ANONYMOUS_TIPPING_ID"
ADMIN_KEY="$ADMIN_KEY"
NETWORK="testnet"

echo "Starting contract monitoring..."
echo "Network: $NETWORK"
echo "Contracts: $CONTRACTS"
echo "---"

for contract_id in $CONTRACTS; do
    echo "Checking contract: $contract_id"
    
    # Get contract info
    stellar contract info --id $contract_id --network $NETWORK
    
    # Check recent events
    stellar contract events --id $contract_id --network $NETWORK --limit 5
    
    echo "---"
done
```

#### Health Check Script

```bash
#!/bin/bash
# health-check.sh

check_contract_health() {
    local contract_id=$1
    local contract_name=$2
    
    echo "Checking $contract_name health..."
    
    # Check if contract is responsive
    if stellar contract info --id $contract_id --network $NETWORK >/dev/null 2>&1; then
        echo "✅ $contract_name: Responsive"
    else
        echo "❌ $contract_name: Unresponsive"
        return 1
    fi
    
    # Check admin access (for admin contracts)
    if [[ "$contract_name" != "AnonymousTipping" ]]; then
        if stellar contract invoke --id $contract_id --source-account $ADMIN_KEY -- get_admin >/dev/null 2>&1; then
            echo "✅ $contract_name: Admin access OK"
        else
            echo "❌ $contract_name: Admin access FAILED"
            return 1
        fi
    fi
    
    return 0
}

# Check all contracts
check_contract_health "$CONFESSION_ANCHOR_ID" "ConfessionAnchor"
check_contract_health "$REPUTATION_BADGES_ID" "ReputationBadges"
check_contract_health "$ANONYMOUS_TIPPING_ID" "AnonymousTipping"

echo "Health check completed."
```

### Alert Configuration

#### Key Metrics to Monitor

1. **ConfessionAnchor**
   - Confessions per hour
   - Failed confession attempts
   - Storage utilization percentage
   - Admin action frequency

2. **ReputationBadges**
   - Badges awarded per day
   - Reputation changes
   - Administrative adjustments
   - User registration rates

3. **AnonymousTipping**
   - Tips per hour
   - Total tip volume
   - Settlement success rate
   - Gas usage patterns

#### Alert Thresholds

```bash
# Example alert configuration
ALERT_CONFESSIONS_PER_HOUR=100
ALERT_TIPS_PER_HOUR=500
ALERT_ADMIN_ACTIONS_PER_DAY=10
ALERT_GAS_SPIKE_MULTIPLIER=3.0

# Monitoring logic would check these thresholds and trigger alerts
```

## Troubleshooting Guide

### Common Administrative Issues

#### "Not Authorized" Errors

**Symptoms**: Administrative calls fail with authorization errors

**Diagnosis**:
```bash
# Check current admin
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_admin

# Check if you're using correct key
echo "Using key: $ADMIN_KEY"
echo "Contract ID: $CONTRACT_ID"
echo "Network: $STELLAR_NETWORK"
```

**Solutions**:
1. Verify ADMIN_KEY environment variable
2. Check contract ID is correct
3. Ensure network matches deployment
4. Confirm admin rights weren't transferred

#### "Contract Not Found" Errors

**Symptoms**: Contract address returns not found

**Diagnosis**:
```bash
# Verify contract exists
stellar contract info --id $CONTRACT_ID --network $STELLAR_NETWORK

# Check network configuration
stellar network list
```

**Solutions**:
1. Verify contract ID is correct
2. Check network is properly configured
3. Ensure contract is deployed to correct network
4. Wait for network propagation

#### Gas/Transaction Issues

**Symptoms**: Transactions fail or take too long

**Diagnosis**:
```bash
# Check network status
stellar network status

# Check current fees
stellar network fees

# Test with simple transaction
stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_version
```

**Solutions**:
1. Increase gas limit for complex operations
2. Check network congestion
3. Verify account has sufficient XLM
4. Retry during off-peak hours

### Performance Issues

#### Slow Response Times

**Diagnosis**:
```bash
# Measure response time
time stellar contract invoke --id $CONTRACT_ID --source-account $ADMIN_KEY -- get_version

# Check network latency
stellar network ping
```

**Optimization**:
1. Use closer RPC nodes
2. Batch operations where possible
3. Consider contract upgrades for efficiency
4. Monitor during different time periods

## Backup and Recovery

### Configuration Backup

```bash
# Backup current configuration
backup-configs.sh() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="backups/$timestamp"
    
    mkdir -p $backup_dir
    
    # Save contract IDs
    cat > $backup_dir/contracts.env << EOF
CONFESSION_ANCHOR_ID=$CONFESSION_ANCHOR_ID
REPUTATION_BADGES_ID=$REPUTATION_BADGES_ID
ANONYMOUS_TIPPING_ID=$ANONYMOUS_TIPPING_ID
STELLAR_NETWORK=$STELLAR_NETWORK
EOF
    
    # Save admin addresses
    stellar contract invoke --id $CONFESSION_ANCHOR_ID --source-account $ADMIN_KEY -- get_admin > $backup_dir/confession_admin.txt
    stellar contract invoke --id $REPUTATION_BADGES_ID --source-account $ADMIN_KEY -- get_admin > $backup_dir/reputation_admin.txt
    
    echo "Configuration backed up to: $backup_dir"
}

backup-configs
```

### Recovery Procedures

```bash
# Restore from backup
restore-configs() {
    local backup_dir=$1
    
    if [[ ! -d "$backup_dir" ]]; then
        echo "Backup directory not found: $backup_dir"
        return 1
    fi
    
    # Restore environment
    source $backup_dir/contracts.env
    
    echo "Configuration restored from: $backup_dir"
    echo "Current admin addresses:"
    echo "ConfessionAnchor: $(cat $backup_dir/confession_admin.txt)"
    echo "ReputationBadges: $(cat $backup_dir/reputation_admin.txt)"
}

# Usage
restore-configs "backups/20240125_143022"
```

## Best Practices Summary

### Daily Operations
- [ ] Check contract health status
- [ ] Review administrative actions
- [ ] Monitor key metrics
- [ ] Verify backup integrity

### Weekly Operations
- [ ] Rotate admin keys (if policy requires)
- [ ] Review and update documentation
- [ ] Analyze usage patterns
- [ ] Test recovery procedures

### Monthly Operations
- [ ] Full security audit
- [ ] Performance optimization review
- [ ] Update emergency contacts
- [ ] Review and update alert thresholds

### Security Checklist
- [ ] Admin keys stored securely
- [ ] Multi-factor authentication enabled
- [ ] Access logs reviewed regularly
- [ ] Emergency procedures documented
- [ ] Backup procedures tested
- [ ] Key rotation schedule followed

This guide provides the essential information for effective contract administration while maintaining security and operational excellence.
