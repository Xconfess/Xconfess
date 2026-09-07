# Xconfess GrantFox Readiness

Date: 2026-09-05

This document summarizes the current GrantFox readiness evidence in the
repository. It does not fabricate users, traction, transaction counts, or live
usage statistics.

## Product Evidence

- Live frontend: https://xconfess.vercel.app/
- Public traction page: https://xconfess.vercel.app/traction
- Public aggregate API: `/api/public/traction`
- Public Stellar config API: `/api/stellar/config`
- Health endpoints: `/api/health/live`, `/api/health/ready`,
  `/api/health/status`

The traction endpoint reports real persisted aggregate data only. Zero values
are valid and must not be replaced with projected or manually edited metrics.

## Stellar Evidence

- Testnet deployment metadata is stored in `deployments/testnet.json`.
- Contract environment validation is available through
  `npm run contracts:verify-env`.
- Backend contract ID validation rejects metadata from the wrong Stellar
  network when Stellar features are enabled.
- Tipping verification is idempotent by `confessionId` and transaction hash.
- Chain reconciliation retries pending/stale tips and refuses to verify
  placeholder or invalid tip amounts.
- Soroban event checkpointing persists one recovery checkpoint per network and
  contract without storing raw event payloads.

## Privacy Evidence

- Analytics ingestion rejects sensitive field names recursively before
  persistence.
- Analytics metadata uses an allowlist and excludes confession content, private
  message bodies, passwords, tokens, email, phone numbers, raw IPs, seed
  phrases, and private keys.
- Public traction is aggregate-only.
- Smoke and diagnostics scripts check public JSON responses for sensitive key
  exposure.

## Validation Evidence

Local readiness command:

```bash
npm run production:readiness
```

Latest local result observed on 2026-09-05:

- Backend build: passed.
- Backend lint: passed.
- Focused backend readiness tests: passed, 62 tests.
- Full backend test suite: passed, 1511 tests with 35 skipped tests.
- Frontend lint: passed with warnings.
- Frontend typecheck: passed.
- Focused frontend readiness tests: passed, 3 tests.
- Frontend production build: passed.
- Contract environment verification: passed for testnet metadata.
- Secret scanner self-test: passed.
- Deploy preflight: passed.
- Secret scan: passed.

Production smoke command:

```bash
npm run deploy:smoke
```

Latest deployed result observed on 2026-09-05:

- Failed because backend liveness timed out after 15000ms at
  `https://xconfess-backend.onrender.com/api/health/live`.
- This is a production environment blocker, not a code-level traction claim.

## Remaining Blockers

- Restore live backend liveness before GrantFox submission.
- Run database migration validation with configured production-like database
  environment. Local `npm run backend:migration:show` currently cannot load
  `data-source.ts` because required database environment variables are absent.
- Reduce existing frontend lint warnings.
- Review npm audit findings before campaign launch.
- Generate and validate mainnet deployment metadata before any mainnet claim.
