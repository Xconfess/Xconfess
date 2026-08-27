# [wave] fix(contracts): anonymous-tipping CLI invoke fails with Missing Entry SorobanString

## Summary
Deployed `anonymous-tipping` testnet contract `CAJK27UHTBUGQFUMN5TG5LOQXYODT6NHOY7Z5DVRRMR7CZ4SCIZUE5A3` cannot be invoked via Stellar CLI v25 (`stellar contract invoke`), blocking `init` and read-only smoke tests.

## Problem
After `stellar contract deploy` succeeds, any invoke against the contract fails:

```
error: Missing Entry SorobanString
```

Reproduced with `init`, `is_paused`, and `global_tip_count`. Other deployed contracts (`confession-anchor`, `confession-registry`, `reputation-badges`) invoke successfully on the same network and CLI version.

## Scope
- Diagnose contract metadata / spec embedding for `anonymous-tipping` WASM built with `stellar contract build --optimize`.
- Fix root cause so CLI and SDK invocations work, or document a supported workaround.
- Call `init` on testnet and verify `is_paused` returns `false`.
- Add a post-deploy smoke-test note to `xconfess-contracts/DEPLOYMENT.md`.

## Out of scope
- Redeploying unrelated contracts.
- Backend tip verification idempotency (see #170).

## Files
- `xconfess-contracts/contracts/anonymous-tipping/**`
- `xconfess-contracts/DEPLOYMENT.md`
- `deployments/testnet.json` (only if contract ID changes)

## Acceptance Criteria
- `stellar contract invoke --id <TIPPING_ID> --network testnet --send=yes -- init` succeeds once.
- `stellar contract invoke ... --send=no -- is_paused` returns `false`.
- Document repro steps and fix in PR description.

## Labels
`bug` `contracts` `stellar` `P1`

## How To Test
```bash
cd xconfess-contracts
stellar contract build --optimize
stellar contract invoke \
  --id CAJK27UHTBUGQFUMN5TG5LOQXYODT6NHOY7Z5DVRRMR7CZ4SCIZUE5A3 \
  --source-account xconfess-deployer \
  --network testnet \
  -- init
```
