# Stellar Testnet Development and Troubleshooting

Use this guide for backend Stellar/Soroban work on Testnet. Normal local
development does not require a Stellar account: keep
`STELLAR_FEATURES_ENABLED=false` unless the task needs on-chain reads or writes.

## Safe setup

Bootstrap the ignored local environment and keep the default Testnet endpoints:

```bash
npm run env:bootstrap
```

```env
STELLAR_FEATURES_ENABLED=true
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc-testnet.stellar.org
```

The contract IDs in `deployments/testnet.json` are public metadata. Verify that
the configured network and IDs agree with that manifest:

```bash
npm run contracts:verify-env
```

Only signed writes require `STELLAR_SERVER_SECRET`. Generate a dedicated
Testnet-only account with the Stellar CLI and put its secret in the ignored
`xconfess-backend/.env`; never commit it, print it, or paste it into an issue.
Read-only diagnostics do not need a secret.

## Safe diagnostics

These commands expose only public service status or public account/contract
identifiers:

```bash
curl -fsS https://horizon-testnet.stellar.org/health
curl -fsS -X POST https://soroban-rpc-testnet.stellar.org \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
npm run contracts:verify-env
curl -fsS http://localhost:5000/api/health/live
curl -fsS http://localhost:5000/api/stellar/config
```

To check whether a public account exists, replace the placeholder with a
`G...` public key. Do not use an `S...` secret:

```bash
curl -fsS https://horizon-testnet.stellar.org/accounts/G_PUBLIC_KEY
```

## Troubleshooting matrix

### Network or RPC mismatch

Symptoms include `tx_bad_auth`, a missing account that is known on another
network, contract-not-found responses, or `contracts:verify-env` reporting that
`STELLAR_NETWORK` differs from `deployments/testnet.json`.

1. Confirm `STELLAR_NETWORK=testnet`.
2. Confirm both URLs contain the Testnet host shown above; do not mix Testnet
   Horizon with Mainnet or Futurenet RPC.
3. Run `npm run contracts:verify-env` and correct the environment, not the
   committed deployment manifest.
4. Restart the backend after changing environment variables.

The Testnet network passphrase is `Test SDF Network ; September 2015`. Code
should obtain it from the SDK's Testnet constant rather than duplicating it.

### Missing or invalid contract IDs

When features are enabled, all three IDs are required:

- `CONFESSION_ANCHOR_CONTRACT_ID`
- `REPUTATION_BADGES_CONTRACT_ID`
- `TIPPING_SYSTEM_CONTRACT_ID`

Each Soroban contract ID starts with `C` and is 56 characters. Copy the public
values from `deployments/testnet.json` or a verified deployment output, then run
`npm run contracts:verify-env`. Do not substitute a Stellar account (`G...`) or
secret (`S...`) for a contract ID.

### Insufficient Testnet funds

A Horizon `404` for a new public key means the account has not been created on
Testnet. Fund only its public key with Friendbot:

```bash
curl -fsS -X POST 'https://friendbot.stellar.org?addr=G_PUBLIC_KEY'
```

Then query the public account endpoint again. If the account exists but a
transaction reports insufficient balance or fee, fund it again and wait for
ledger confirmation. Testnet XLM has no monetary value; never send Mainnet XLM
or reveal the secret seed to a faucet.

### Disabled feature flags

If `/api/stellar/config` returns null contract IDs or Stellar actions are not
available, check `STELLAR_FEATURES_ENABLED`. The exact string `true` enables the
backend integration. With the flag disabled, startup intentionally succeeds
without signer or contract configuration and Stellar-dependent behavior returns
safe disabled/default responses.

For non-Stellar work, this is the recommended configuration:

```env
STELLAR_FEATURES_ENABLED=false
```

Do not work around a disabled flag by adding a secret or calling RPC directly
from unrelated application code.

## Verification before a PR

```bash
npm run contracts:verify-env
npm test --workspace=xconfess-backend -- stellar --runInBand
```

Redact environment values before attaching output. Public contract IDs and
`G...` addresses are not secrets, but private `S...` seeds, auth tokens, message
bodies, and user data must never appear in fixtures, logs, screenshots, or PRs.

See also the [feature-flag matrix](stellar-feature-flag-matrix.md),
[Soroban setup reference](SOROBAN_SETUP.md), and
[contract release runbook](contract-release-and-upgrade-runbook.md).
