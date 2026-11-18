# Contribution malware and supply-chain security audit

Date: 2026-10-22 (Africa/Lagos). Baseline: `d16800ed`.
Repository: Xconfess/Xconfess. Working branch: `security/wave-10-audit`.
The initial working tree was clean. Changes remain local and uncommitted.

This document records the initial static audit. Subsequent CI repairs, executed
checks and remaining CI blockers are tracked in [CI verification](ci-verification-wave-10.md).

## A. Security status

**No confirmed malware was identified in the inspected material. This is a
qualified static assessment, not a malware-free certification.** Verified
security weaknesses were found; two were repaired and preventive checks added.
The supplied Drips warning and its attribution were treated as investigation
inputs, not independently authenticated incident intelligence.

### Scope and approach

- Enumerated all 1,672 baseline tracked files: Nest backend, Next frontend,
  Soroban contracts, scripts, deployment metadata, documentation and workflows.
- Scanned working files, including hidden paths, for the supplied exact markers,
  editor auto-execution, execution primitives, encoded content and suspicious
  install entrypoints. Byte-level marker inspection also included NUL files.
- Inspected all four first-party package manifests, both npm lockfiles,
  Cargo-related execution indicators, primary JS/TS build/test/lint configs,
  deployment workflow and the three active root workflows. The nested
  `xconfess-backend/e2e/.github/workflows/e2e.yml` was read; it is not an active
  workflow at that location.
- Inspected the latest 30 local commit summaries/file statistics and recent
  security-sensitive path history. Searched locally available history for the
  exact supplied markers and relevant indicator paths. No complete historical
  semantic audit was performed.
- Scanned all cached `origin` refs for exact markers and `folderOpen`. Ref names
  and baseline asset SHA-256 hashes are in
  [the evidence inventory](security-audit-wave-10-evidence.json). No remote
  fetch was performed; cached branches can be stale.
- Queried connected GitHub for open PRs (one returned: #2373), retrieved its
  30-file patch, and inspected its manifest, lockfile, CI and execution-sensitive
  changes. Retrieved patches for the 10 most recently updated merged PRs:
  #2372, #2370, #2368, #2367, #2366, #2365, #2364, #2363, #2362, #2361.
  Applied indicator screening and focused review to their scripts/config changes.
  These checks are not a full correctness/security review of every changed line.

### Areas with no identified malware indicators

- No `.vscode/tasks.json` or `.vscode/settings.json` in the checkout; no matching
  auto-run triggers in the initial scan.
- None of `fa-solid-500.woff2`, `fa-solid-600.eot`, `fa-solid.lik`, or
  `fa-solid-300.ttf` exists in the baseline tracked checkout. Consequently there
  are no current-file hashes or font origins to report. Historical path searches
  did not identify these names.
- No supplied exact marker matches in baseline files or the cached ref scans.
- No first-party preinstall/install/postinstall/prepare hook, `dist/setup.js`
  entrypoint, or unexpected `node api.js` execution identified. Historical paths
  named `api.js` also include ordinary former application/dependency code;
  filenames alone establish no threat.
- Reviewed Next/PostCSS/ESLint/Jest/Playwright config content showed no identified
  appended executable payload, remote loader or long-whitespace concealment.
- Child-process uses in Docker/readiness/secret-scan wrappers are consistent
  with their stated maintenance functions. `explain-queries.js` imports
  `spawnSync` without using it. Redis `eval` executes a Lua lock operation,
  not JavaScript eval. Wallet/message base64 routines encode cryptographic data.
- `docs/data-export-contributor-guide.md` is base64-encoded Markdown; decoding
  as data produced a contributor guide, not an executable loader. Its history
  points to `fccab57e` (#2062). `docs/adr/README.md` contains a NUL at byte 363,
  originating in `f6e21635`; no execution linkage was identified.
- NUL-containing image assets have PNG/JPEG/ICO headers consistent with their
  extensions. Hashes are preserved in the evidence inventory. This does not
  exclude polyglot content or steganography; no antivirus engine was available.
- Reviewed URLs fit API/proxy, Stellar, wallet, moderation, email, local-service
  and test-fixture contexts. No credential-harvesting/exfiltration path was
  established. This was a static sink/indicator review, not complete dataflow
  analysis of every network request.
- No active non-sample local Git hook, symlink entry, or custom Git hook path
  was identified. A token/private-key pattern search produced only an audit
  redaction test fixture. No verified exposed live credential was established.

## B. Findings table

Severity describes potential impact, not proof of exploitation or intent.

| Severity | File | Finding | Commit/PR evidence | Action/status |
|---|---|---|---|---|
| High | `.github/workflows/cd.yml` | Secrets interpolated into shell source can execute shell syntax or break quoting. The unquoted environment-file heredoc also expands shell substitutions present in secret text. Requires control of a configured value; no exploitation established. | Initial secret interpolation exists in `541eaf41` (commit message references #647); later revisions changed the write to a heredoc. | Fixed secret validation/file writing and SSH target interpolation using environment variables and quoted expansion; write env files with restrictive umask. |
| Medium | `scripts/secret-scanning-preflight.sh` | Findings stored and printed the original source line, exposing a matching secret and possibly other secrets in CI logs. | `fe04d65a` contains both `snippet = line.strip()` and snippet printing. | Fixed: source line replaced with a constant redaction message. Existing partial-match masking remains. Review past logs if a real secret was detected. |
| High | `.github/workflows/cd.yml` | SSH host key is accepted from live `ssh-keyscan` without independent authentication; network interception can direct deployment data to an attacker. | Present in `541eaf41` (#647 per commit message). | Open: pin an out-of-band verified known_hosts record/fingerprint. Maintainer must supply authentic host identity. |
| High | `.github/workflows/cd.yml` | Push deployment starts independently of CI; there is no explicit successful CI/security gate before installation/build/deploy. | Current workflow at baseline `d16800ed`; exact introducing change not established. | Open: require passing CI on the deployed SHA and restrict protected environments to trusted branches and required reviewers. |
| Medium | `package-lock.json` | 1,449 of 2,841 package entries lack integrity metadata. Both npm lockfiles have no observed non-npm-registry resolved URL; absent metadata is not malware evidence. | Root lock last touched at `a1cc75bc`; this is not attribution of all missing metadata to that commit. | Investigate/regenerate using the pinned npm version in an isolated trusted environment; review diff before adopting. Do not fabricate checksums. |
| Medium | `package.json`, npm lockfiles, CI | Root audit command invokes `npx audit-ci` without a locked direct audit-ci dependency. Ordinary installs permit dependency lifecycle execution. | Current baseline; introducing commit not established. | Pin audit tooling and review lifecycle requirements before tightening application installs. Audit-only installs can use `--ignore-scripts`. |
| Medium | `audit-ci.json` | 17 advisory allowlist entries reduce audit coverage; current applicability and compensating controls were not revalidated. | Last path change `467d10c0`; no malicious intent established. | Obtain fresh advisories, assign owners and expiry/justification to each suppression. |
| Medium | `.github/workflows/*` | Third-party actions reference mutable tags, including `dtolnay/rust-toolchain@master`. | Baseline; individual introducing commits not established. | Pin verified action commit SHAs, review action sources, and maintain updates. Root workflows already grant only `contents: read`. |
| Low | `scripts/secret-scanning-preflight.sh` | Tests/generated directories are excluded, errors are silently swallowed and whole-line placeholder rules can hide another credential on the same line. | Current scanner; only the log-disclosure introduction was traced. | Add independent full-history secret scanning; improve exception/allowlist handling in a separate tested change. |

No contributor is classified as malicious. Commit references establish content
provenance only. PR numbers from local commit messages are explicitly marked;
GitHub PR identity and commit authorship can differ. Recent remote PR metadata
also differed from some local merge-subject labels; local subjects were not
treated as authoritative PR author attribution.

### Dependency installation review

Root lockfile `hasInstallScript` entries (10): `@reown/appkit`, `@scarf/scarf`,
`bufferutil`, `msgpackr-extract`, `msw`, `secp256k1`, `sqlite3`, `unrs-resolver`,
`utf-8-validate`, and backend-nested `@swc/core`. Backend lockfile has 1,209
entries, zero missing integrity fields under the same counting rule and seven
install-script entries: `@nestjs/core`, `@scarf/scarf`, `@swc/core`, `fsevents`,
`msgpackr-extract`, nested Playwright `fsevents`, and `unrs-resolver`.
Counts are metadata observations, not a guarantee that all install hooks are
recorded or safe. Published tarballs and their install-script bodies were not
downloaded or executed. Native builds and telemetry are plausible legitimate
purposes and need individual review. No dependency was removed as malware.

## C. Changes made

1. Created local `security/wave-10-audit` branch; no push, merge, history rewrite
   or issue/PR mutation.
2. Changed deployment secret handling to pass values through `env`, quote shell
   expansions and use `printf` instead of interpolated heredocs. Environment
   files use `umask 077`. Existing deployment behavior otherwise remains.
3. Removed original source-line retention from secret-scan findings.
4. Added `scripts/check-malware-indicators.ps1`: dependency-free static detector
   for exact supplied markers in code/config/assets, VS Code automatic tasks,
   first-party lifecycle hooks and unexpected setup entrypoints. Findings show
   paths/rules only. Includes nine synthetic fixtures. File names alone never
   classify fonts as malware. Reparse points fail for manual review.
5. Added `Security / Malware indicators` to CI before the npm audit job can
   install dependencies. App/migration/contract jobs inherit that dependency
   through audit. This does not gate the separate CD or deployed-smoke workflows.
6. Added weekly Dependabot updates for root npm workspaces, Cargo and Actions.
7. Added this report and asset/ref evidence inventory.

The detector is a tripwire: signatures can be renamed or encoded, documentation
is not a blocking signature target, it does not interpret VS Code JSONC or
JavaScript semantically, and dependency tarballs/ignored files are outside its
scope. Review changes to the detector itself and its workflow. A contributor
able to modify enforcement can weaken it unless branch rules and owner review
are enforced externally.

## D. Remaining risks and maintainer actions

- Before trusting production deployments, authenticate the SSH host key,
  enforce successful CI on the exact deployed SHA and restrict environment refs.
- Configure branch rules: prohibit direct pushes/force pushes, require passing
  security checks, independent approving review, dismissal of stale approvals
  and owner review of workflows/manifests/lockfiles/configs/scripts. Choose real
  maintainer teams for CODEOWNERS; none were invented in this audit.
- Enable GitHub secret scanning/push protection where supported and inspect
  existing alerts. Review historical CI logs if the old scanner found secrets;
  rotate those credentials if exposed. No blanket credential rotation is
  justified by the evidence found here.
- Enable CodeQL for JavaScript/TypeScript or equivalent analysis. Confirm
  repository eligibility/settings and test its workflow before requiring it.
- Review/install third-party lifecycle code in a disposable environment without
  production credentials. Do not globally disable scripts until native dependency
  requirements have been tested. Audit tooling can install without hooks.
- Run a fresh dependency advisory scan and reconcile the two npm lockfiles.
  Do not use old committed audit JSON as evidence of current vulnerability state.
- Review the open PR #2373 through normal independent security/correctness review;
  its synthetic PostgreSQL/Redis/TCP fault fixtures are not malware evidence.
  The known fail-open session behavior visible in its diff deserves normal
  application-security attention separately from this malware audit.

Not examined: private forks, unreturned PRs, older merged PRs outside the ten
sampled, deleted/unreachable Git objects, every historical revision's semantics,
dependency tarball contents, running deployments, developer-host compromise,
account audit logs, environment secrets, GitHub branch/environment protection
settings, existing security alerts, complete Rust contract correctness, or
exhaustive application authorization/cryptography. No exploitability claim is
made about unverified dependency advisories.

## E. Verification

- Static baseline inspection: 1,672 tracked files; supplied marker byte scan
  passed. Cached remote-ref marker and folderOpen scans returned no matches.
- Retrieved current open PR patch and ten recently updated merged PR patches;
  indicator screening found no supplied markers or suspicious execution
  primitives in those patches.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-malware-indicators.ps1 -SelfTest`:
  PASS, nine fixtures. Bypass applies only to this child process running the
  newly reviewed detector; no persistent execution-policy change was made.
- Detector full checkout scan: PASS (count includes newly added audit files).
- `git diff --check`: PASS.
- No repository install, build, application start, dependency hooks, restore
  drills or suspicious content was executed. Node is unavailable; Python's
  Windows launcher target is inaccessible. The modified Python scanner's own
  self-test, application tests, current npm audit and Linux pwsh CI execution
  were not run. Workflow changes received static diff review; no hosted CI run
  or live deployment was triggered. Maintainers should run those validations
  in an isolated trusted environment before merging.

## F. Drips Wave security readiness

**Conditionally ready for reviewed contributions; not cleared for unattended
installation or production deployment.** No reviewed evidence establishes the
reported malware campaign in this checkout. The new checks improve early
detection, but unverified dependency hooks/integrity gaps, mutable action refs,
ungated deployment and unauthenticated SSH host-key acquisition remain blockers
to stronger supply-chain assurance. External protection settings remain unknown.

Reference guidance: [GitHub script injection](https://docs.github.com/en/actions/concepts/security/script-injections)
explains why data must not be inserted directly into generated shell source;
[npm 10 ci](https://docs.npmjs.com/cli/v10/commands/npm-ci/)
documents `--ignore-scripts` and its limits. Neither source proves this repository
has been exploited.
