# Contract Error Registry Compatibility

`deployments/error-registry-history.json` is the historical client-visible error registry. It records stable numeric codes, names, classifications, and HTTP status mappings.

## Compatibility rules

- Never reuse or renumber an existing code.
- Never change the meaning or classification of an existing code.
- Add only a new code for a new meaning.
- Update the historical registry and bump `ERROR_REGISTRY_VERSION` only for an intentionally breaking registry change.
- Contract fixtures and compatibility documentation must be updated in the same change.

## Verification

```bash
npm run contracts:error-registry-check
npm run contracts:manifest-check
```

CI fails on code renumbering, name reuse, classification drift, stale contract manifests, missing contract IDs, or ABI/WASM/testnet version mismatch. Deployment workflows run both contract checks before a staging or production deploy.

The historical registry is the source of truth for deployed clients. Any disagreement between Rust constants, fixture entries, and this JSON file is a release blocker.
