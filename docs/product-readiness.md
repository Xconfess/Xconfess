# Xconfess Product Readiness

Date: 2026-09-08

This document summarizes the current production readiness evidence in the
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
npm run readiness
```

The readiness command also writes a schema-versioned JSON scorecard and a
human-readable Markdown scorecard under ignored local `readiness-results/`.
See `docs/production-readiness-scorecard.md`.

Latest local result observed on 2026-09-08:

- Backend build: passed.
- Backend lint: passed.
- Focused backend readiness tests: passed, 63 tests across analytics,
  public traction, chain reconciliation, Soroban checkpointing, Stellar
  diagnostics/configuration, and health suites.
- Frontend lint: passed with no warnings.
- Frontend typecheck: passed.
- Focused frontend readiness tests: passed, 3 tests covering traction and the
  public traction proxy.
- Frontend production build: passed.
- Contract environment verification: passed for testnet metadata.
- Secret scanner self-test: passed.
- Dependency audit: 0 critical, 0 high, and 0 moderate findings. Two accepted
  low findings remain from `csurf`'s bundled `cookie` dependency and are
  documented in `docs/dependency-security-audit.md`.
- Migration validation: a disposable local Postgres database applied all 51
  TypeORM migrations from an empty schema with
  `npm run backend:migration:run`, then `npm run backend:migration:show`
  reported all 51 as applied. A separate disposable database was
  schema-synchronized to reproduce the legacy Render synchronized-schema state;
  `npm run render:prestart` baselined 51 compiled migrations there as well.

Production smoke command:

```bash
npm run deploy:smoke
```

Latest deployed result observed on 2026-09-07:

- Passed without mutation mode after adding bounded retries for Render
  hibernation wake responses.
- Covered backend liveness, readiness/status handling, public traction, public
  Stellar configuration, frontend traction page, session guard, and register
  method guard.

## Remaining Blockers

- Render free-tier cold starts can still delay the first backend response after
  inactivity. A non-hibernating backend remains recommended before campaign
  review windows.
- Replace `csurf` with maintained CSRF middleware to remove the remaining low
  dependency finding.
- Generate and validate mainnet deployment metadata before any mainnet claim.
