# Contract Signer Key Rotation Runbook

**Scope:** Xconfess Soroban smart contracts  
**Audience:** Core maintainers with contract admin access  
**Related issues:** #117 (emergency pause guard), #123 (admin role transfer timelock), #144 (governance quorum)

---

## Part 1 — Routine Signer Rotation

Use this flow for **planned** key rotations (scheduled maintenance, key age policy, personnel change).

### Pre-rotation checklist

- [ ] Confirm the new key pair has been generated on an air-gapped machine
- [ ] Store the new secret key in the team vault (e.g. 1Password / HashiCorp Vault)
- [ ] Obtain quorum sign-off from at least the number of signers required by governance policy
- [ ] Schedule a maintenance window if the contract will be paused during rotation
- [ ] Notify on-call team at least 24 h in advance

### Step 1 — Generate and verify the new keypair

```bash
# Generate new keypair (air-gapped preferred)
stellar keys generate --network testnet new-admin

# Print public key for verification
stellar keys address new-admin
```

Record the new public key and share it with the team for quorum approval.

### Step 2 — Pause the contract (recommended)

```bash
# Pause to prevent state changes during key handoff
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $CURRENT_ADMIN_KEY \
  --network mainnet \
  -- pause --reason "Planned admin key rotation — maintenance window"
```

Verify the pause:

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- is_paused
# Expected: true
```

### Step 3 — Initiate the admin role transfer (timelock)

The contract enforces a timelock before the transfer takes effect (ADR #123):

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $CURRENT_ADMIN_KEY \
  --network mainnet \
  -- propose_admin_transfer --new_admin $NEW_ADMIN_PUBLIC_KEY
```

Note the `transfer_id` and the `earliest_executable_at` timestamp returned.

### Step 4 — Wait for timelock to elapse

The timelock period is defined in the contract configuration. Do not proceed until `earliest_executable_at` has passed. Confirm on-chain:

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- pending_admin_transfer
# Confirm new_admin and earliest_executable_at
```

### Step 5 — Execute the transfer with quorum approval

Collect the required number of signatures from current quorum signers, then execute:

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $QUORUM_SIGNER_KEY \
  --network mainnet \
  -- execute_admin_transfer --transfer_id $TRANSFER_ID
```

### Step 6 — Verify and unpause

```bash
# Confirm the new admin is active
stellar contract invoke \
  --id $CONTRACT_ID \
  --network mainnet \
  -- admin
# Expected: $NEW_ADMIN_PUBLIC_KEY

# Unpause the contract
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $NEW_ADMIN_KEY \
  --network mainnet \
  -- unpause --reason "Key rotation complete"

# Verify
stellar contract invoke --id $CONTRACT_ID --network mainnet -- is_paused
# Expected: false
```

### Post-rotation checklist

- [ ] Revoke the old key from the team vault
- [ ] Update `deployments/` manifest with new admin public key
- [ ] Run smoke tests against the live contract
- [ ] Log the rotation in the audit trail (date, operator, reason)
- [ ] Close the maintenance window notification

---

## Part 2 — Emergency Break-Glass Response (Compromised Key)

Use this flow when a signer key is believed to be **compromised or exposed**.

> **Treat this as a P0 incident.** Start the response immediately; do not wait for a maintenance window.

### Step 1 — Stop, contain, and assess

1. **Do not use the compromised key** for any further operations.
2. Revoke the compromised key from all vaults and secret managers immediately.
3. Determine the blast radius:
   - Check on-chain history for unexpected admin or governance actions in the last 24 h.
   - Check off-chain infrastructure for signs of credential use (logs, CI secrets, API calls).
4. Page the on-call team via the incident channel.

### Step 2 — Pause the contract using a different key

If the compromised key was the primary admin, use a quorum of governance signers to pause:

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $QUORUM_SIGNER_KEY \
  --network mainnet \
  -- emergency_pause --reason "Suspected key compromise — P0 incident"
```

If the contract is already paused (attacker triggered it), verify pause state and proceed.

### Step 3 — Rotate to a new key

Follow **Part 1, Steps 1–6** using an emergency key pre-generated and stored in the break-glass vault. If no break-glass key exists, generate one now and proceed with quorum transfer.

### Step 4 — Audit all recent on-chain actions

```bash
# List recent governance and admin events (adjust block range as needed)
stellar events \
  --contract-id $CONTRACT_ID \
  --start-ledger $INCIDENT_START_LEDGER \
  --network mainnet
```

Identify and document any unauthorised actions. If irreversible damage was done (e.g. funds moved), escalate to the legal/security team.

### Step 5 — Recover and validate

1. Restore the contract to normal operation only after confirming the new key is in place and the old key is fully revoked.
2. Run the full test suite against the live contract.
3. Unpause when satisfied:

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source-account $NEW_ADMIN_KEY \
  --network mainnet \
  -- unpause --reason "Break-glass rotation complete — incident $INCIDENT_ID"
```

### Step 6 — Post-incident communication and verification

- [ ] Notify all stakeholders (community, partners, auditors) via official channels
- [ ] Publish a post-mortem within 72 h (root cause, timeline, remediation)
- [ ] Update the break-glass vault with the new key
- [ ] Schedule a retrospective to review detection time and response quality
- [ ] File the incident in the audit trail with full timeline

---

## Drills

Run a tabletop drill at least once per quarter:

1. Simulate a planned rotation using the testnet contract.
2. Simulate a compromised-key scenario: pause the testnet contract, perform break-glass rotation, unpause.
3. Record drill date, participants, and any gaps found in this runbook.

---

## References

- `maintainer/issues/117-feat-contract-emergency-pause-guard.md`
- `maintainer/issues/123-feat-contract-admin-role-transfer-timelock.md`
- `maintainer/issues/144-feat-contract-governance-quorum-critical-actions.md`
- `xconfess-contract/README.md`
