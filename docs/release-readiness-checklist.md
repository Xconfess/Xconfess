# Release Readiness Checklist

Use this checklist before any staging or production release that affects the backend, frontend, contracts, or shared operations flow.

## Release Scope

- [ ] Record the release owner, target environment, and planned release window.
- [ ] Link the pull request, issue, or release notes bundle that defines the intended changes.
- [ ] Confirm which subsystems changed: `backend`, `frontend`, `contracts`, `docs`, or `ops`.
- [ ] Confirm the rollback owner and the communication channel to use if the release needs to pause or revert.

## Pre-Release Gates

### Repository And CI

- [ ] Run dependency install from the repo root: `npm ci`
- [ ] Review the latest CI results for `.github/workflows/ci.yml`.
  - **Note:** CI now automatically runs contract check, build, and test gates. Ensure all contract checks pass before proceeding.
- [ ] **Confirm the `Security / npm audit` CI job passed.** CI blocks on unapproved critical/high vulnerabilities using `audit-ci` (see `audit-ci.json`).
- [ ] Run the audit check locally before release: `npm run audit:ci`
- [ ] Review `audit-ci.json` for any suppressions whose `expires` date has passed; renew or resolve each before merging.
- [ ] Any new suppression added to `audit-ci.json` must include: the GHSA advisory ID, a reason explaining why it is safe to suppress, and an expiry date no more than 90 days out. Link to the tracking issue.
- [ ] Confirm no unresolved blockers remain in code review or release notes.
- [ ] Verify any required environment variable or secret changes are prepared before deployment.

### Backend Readiness

- [ ] Build the backend: `npm run build --workspace=xconfess-backend`
- [ ] Lint the backend: `npm run lint --workspace=xconfess-backend`
- [ ] Run backend unit tests: `npm run test --workspace=xconfess-backend`
- [ ] Run backend e2e tests required for the release: `npm run test:e2e --workspace=xconfess-backend`
- [ ] Review schema, migration, and configuration changes in `xconfess-backend`.
- [ ] Confirm API docs or route contracts changed only in ways that downstream consumers can tolerate.
- [ ] Verify websocket, cache, queue, and background-job changes include an operational verification step if they were touched.

### Frontend Readiness

- [ ] Build the frontend with the intended API base URL: `NEXT_PUBLIC_API_URL=http://localhost:5000/api npm run build --workspace=xconfess-frontend`
- [ ] Lint the frontend: `npm run lint --workspace=xconfess-frontend`
- [ ] Run frontend tests: `npm run test --workspace=xconfess-frontend`
- [ ] Smoke-check the primary user journeys affected by the release.
- [ ] Verify auth, dashboard navigation, and any changed admin flows against the backend contract.
- [ ] Check responsive behavior for changed pages on desktop and mobile-sized viewports.

### Contract Readiness

- [ ] Confirm all automated contract gates passed in CI (check, build, test for wasm32 target).
- [ ] Review `docs/contract-release-and-upgrade-runbook.md` before any contract release or upgrade.
- [ ] Optionally run local contract tests for deep validation: `./scripts/test-contracts.sh --verbose`
- [ ] Build the contract artifacts locally to verify: `./scripts/contracts-release.sh build`
- [ ] Verify the generated artifact manifest exists at `deployments/contract-wasm-manifest.json`.
- [ ] Confirm the manifest SHA-256 hashes match the artifacts being promoted using `docs/contract-release-and-upgrade-runbook.md`.
- [ ] Confirm the target network, deployer identity, and funding state before deployment.
- [ ] Verify any backend or frontend config that depends on new contract IDs is ready to update in the same release window.

## Deployment Plan

### Staging Or Canary

- [ ] Deploy to staging or the smallest safe audience first.
- [ ] For GitHub Actions driven deployment, run `.github/workflows/cd.yml` with the correct environment and `run_build` setting.
- [ ] Apply backend changes before frontend changes when the frontend depends on newly released API behavior.
- [ ] Deploy contracts before enabling code that references new contract IDs or event shapes.
- [ ] Capture deployment artifacts, logs, and resulting version identifiers in the release notes.

### Manual Coordination Points

- [ ] Update contract deployment records if new contract IDs were issued.
- [ ] Update runtime configuration for backend and frontend services after deployment artifacts are promoted.
- [ ] Confirm operators know whether the release contains migrations, cache invalidation needs, queue draining, or websocket behavior changes.

## Verification After Deploy

### Backend Verification

- [ ] Confirm the backend starts cleanly and serves the expected environment.
- [ ] Verify health-critical API routes and any changed endpoints.
- [ ] Check logs for migration failures, queue crashes, cache issues, or authorization errors.
- [ ] Verify background workers, realtime events, and scheduled jobs if the release touched them.

### Frontend Verification

- [ ] Load the deployed frontend and confirm the app boots without console or hydration errors.
- [ ] Validate the main release path end to end against the deployed backend.
- [ ] Confirm auth, navigation, and affected dashboards or forms work in the target environment.
- [ ] Re-check one mobile-sized layout for every user-facing page changed in the release.

### Contract Verification

- [ ] If contracts were deployed, confirm deploy commands completed successfully and contract IDs were recorded.
- [ ] Run the contract post-deployment verification checklist from `docs/contract-release-and-upgrade-runbook.md`.
- [ ] Verify downstream consumers can read the expected on-chain data or events.
- [ ] Confirm no unexpected error codes or payload-shape changes surfaced during verification.

## Rollback Readiness

- [ ] Define the exact rollback trigger for this release before starting deployment.
- [ ] Keep the last known-good backend artifact, frontend artifact, and contract metadata available.
- [ ] Confirm which changes (including database migrations, queue configuration, and contract updates) are reversible immediately and which require operator intervention.
- [ ] If a change (such as a contract update or database migration) is not directly reversible, document the mitigation path before release.
- [ ] Prepare the communication message to send if rollback or release pause is required.

## Post-Release Follow-Up

- [ ] Monitor logs, alerts, and user reports during the agreed observation window.
- [ ] Confirm post-release metrics remain within normal ranges for error rate, latency, and job health.
- [ ] Update runbooks or deployment docs if the team had to improvise during the release.
- [ ] Close the release with a short summary of what shipped, what was verified, and any follow-up actions.

## Security Audit Policy

xConfess uses `audit-ci` to enforce a minimum security bar on every CI run. The policy is:

- **Severity threshold:** CI fails on any **critical** or **high** vulnerability not present in the allowlist.
- **Suppression file:** `audit-ci.json` at the repo root. Each entry must include an `advisory` (GHSA ID), a `reason` explaining why suppression is safe, and an `expires` date.
- **Running locally:** `npm run audit:ci` — produces the same result as CI.
- **Generating a full report:** `npm run audit:report` — writes `audit-report.json` (gitignored).
- **Suppression rules:**
  - Only suppress a specific GHSA advisory ID; never suppress an entire package.
  - Reason must explain the impact context (e.g., devDependency, transitive, breaking fix).
  - Expiry must be no more than 90 days from the date the suppression is added.
  - Link the suppression to a tracking issue so it is not silently forgotten.
- **Known deferred upgrades (see issue #1506):**
  - `tar` (transitive via `sqlite3`) — upgrade to `sqlite3` v6 is semver-major; tracked for validation.
  - `nodemailer` — upgrade to v9 is semver-major; backend transport must be re-tested.
  - `@xhmikosr/decompress` (transitive via `@swc/cli` devDep) — upgrade to `@swc/cli` v0.8.1 is semver-major; only affects build toolchain, not application runtime.

## Related References

- `README.md`
- `DEPLOYMENT_CHECKLIST.md`
- `docs/SOROBAN_SETUP.md`
- `docs/contract-release-and-upgrade-runbook.md`
- `deployments/README.md`
