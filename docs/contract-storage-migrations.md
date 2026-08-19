# Contract storage migration notes

Contract upgrades must preserve the serialized representation of existing
storage keys. Deploy application consumers only after the contract migration
has completed and its schema version has been verified.

## Current schema additions

| Contract | Field | Default for existing deployments | Migration entry point |
| --- | --- | --- | --- |
| confession-anchor | `SchemaVersion` | `1` | `migrate` |
| confession-anchor | `LastAnchorTimestamp` | `0` | `migrate` |
| confession-registry | `SchemaVersion` | `1` | `migrate` |
| reputation-badges | `SchemaVersion` | initial schema constant | `migrate` |
| reputation-badges | `ReputationLastUpdate(Address)` | current ledger timestamp on first write | lazy-compatible |
| reputation-badges | `CurrentEpoch` | `0` | lazy-compatible |
| reputation-badges | `Paused` | `false` | lazy-compatible |

## Required deployment order

1. Back up contract IDs, current schema versions, and deployment metadata.
2. Upload the new WASM without switching application traffic.
3. Upgrade the contract and invoke its `migrate` entry point as the admin.
4. Verify the reported schema version and read the new fields.
5. Deploy backend decoders and invocation clients.
6. Deploy the frontend after backend health and event decoding checks pass.

Do not deploy consumers that require a new field before migration. Rolling
back application code is safe while the new fields remain additive; rolling
back contract WASM requires a compatibility review because migrated storage is
not automatically removed.
