# CI repair and verification

Branch: `security/wave-10-audit`. Baseline: `d16800ed`.
The earlier [security audit](security-audit-wave-10.md) is preserved.
Changes are local; nothing has been committed, pushed, merged or deployed.

## Scope

The goal is to repair the existing checks, without disabling jobs, suppressing
new advisories, lowering coverage thresholds, weakening assertions or ignoring
command failures. Dependency updates were investigated but not retained: the
original four dependency files are preserved, and the audit still needs a
supported dependency remediation. No install hooks were executed during local
verification. Project checks were inspected before execution.

## Repairs

- The malware detector uses `Get-Item -Force` so Linux PowerShell can inspect
  tracked dotfiles. Its fixtures and a full Linux checkout scan passed.
- The ABI extractor reads public methods from `#[contractimpl]` blocks instead
  of counting ordinary helper methods. Regression tests cover helper methods,
  comments, strings, multiple blocks and malformed input. Removed the stale
  anchor ABI entry `get_admin`, which is absent from its source and available
  source history; the compatibility manifest's required functions are intact.
- Backend build fixes use the installed TypeORM/Stellar APIs, string column
  lengths, numeric user IDs, enum values and a checked confirmation ledger.
  Notification Redis typing describes the existing ioredis adapter's native
  commands and preserves the atomic NX lock and compare-and-delete Lua script.
- The historical export-worker import re-exports the active, supported worker
  rather than importing an absent package and calling a nonexistent service
  method. Reaction reads count actual reaction records instead of selecting a
  nonexistent entity field.
- Coverage thresholds keep their original numeric values; paths now resolve to
  the covered files. Export fixtures reflect retention checks and scoped reads.
  A regression verifies that explicit token invalidation blocks reuse.
- Constant `400 || 403 || 409` / `403 || 404` test expressions now spell out their
  existing effective values, 400 and 403. Valid Stellar fixtures use encoded
  checksums, and the successful pagination fixture uses distinct page IDs.
- Frontend fixes narrow event payload shapes, expose the implemented wallet
  validation method, update callback refs after commit and store rendered event
  IDs/reconciliation timestamps in state. Message callbacks are declared before
  the hooks that consume them, preserving callback memoization.
- Restored the missing wallet monitor. It does not open access prompts, clears
  stale account state and rejects a poll completing after disconnect. Dedicated
  regression tests cover account changes and the disconnect race.
- Fixed an invalid escaped test title, isolated session drafts between composer
  tests and restored the guest draft/login redirect required by the existing
  composer test. Authenticated submission and the synchronous re-entry guard
  remain in place.

## CI commands

The workflow uses Node 22/npm 10.9.3 and Rust 1.86.0 on Ubuntu. Its effective
checks are:

| Job | Commands |
|---|---|
| Malware indicators | `./scripts/check-malware-indicators.ps1 -SelfTest`; `./scripts/check-malware-indicators.ps1` using `pwsh` |
| npm audit | `npm ci --include=optional --no-audit --no-fund`; `npm run audit:ci` |
| Secret scan | `./scripts/secret-scanning-preflight.sh --self-test`; `./scripts/secret-scanning-preflight.sh` |
| Migration smoke | `npm run backend:migration:smoke` against empty PostgreSQL 16 |
| Apps | `npm run services:wait`; `npm run backend:test:critical-coverage`; `npm run frontend:env:test`; backend build/start; `npm run api:contract-drift -- --spec=...`; Playwright Chromium install; `npm run frontend:test:a11y`; `npm run ci:apps` |
| `ci:apps` expansion | backend build/lint, frontend lint/typecheck/build |
| Contracts | `cargo fmt --all -- --check`; `cargo clippy --workspace --all-targets -- -D warnings`; `cargo test --workspace`; ABI extractor regression tests and ABI drift; `npm run contracts:compatibility`; `npm run contracts:quality-tests`; `bash scripts/contracts-release.sh check`; `bash scripts/test-contract-release-metadata.sh` |

## Verification and remaining blockers

Verification used official Node 22 and Rust 1.86 containers without host
credentials, Ubuntu WSL for dependency-free Python/Bash checks, and PowerShell
7.4 on Linux with Git. Source lines containing credentials were never printed.
Full local logs and command result records are under ignored `readiness-results/`.
Check results below distinguish earlier successful runs from final reruns.

Confirmed earlier passes: backend build and lint, frontend typecheck, all four
critical backend suites (81 tests, unchanged coverage thresholds), nine malware
fixtures and the full Linux detector scan, secret-scanner fixtures/full scan,
ABI extractor fixtures/drift, contract compatibility, four contract quality
tests, six production-auth environment tests, and contract metadata negative
tests. Workflow YAML and expressions passed actionlint 1.7.7, including CD.
Wallet monitoring and WebSocket reconnection regression suites also passed.

Unresolved verified blockers:

- The dependency audit fails. In particular,
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  lists no patched `braces` release. Other high/critical advisories also require
  dependency remediation; this report does not claim that braces is the sole
  blocker. The existing advisory policy was not weakened.
- Clippy reports placeholder authorization tests in
  `xconfess-contracts/contracts/anonymous-tipping/tests/test_authorization.rs`:
  unused fixtures and 13 `assert!(true)` statements. It also rejects an
  `assert_eq!` comparing unit values in the anchor tests. These need meaningful
  tests; assertions and lint enforcement were not removed to make CI pass.
- The local contract test link encountered a GNU binutils 2.40 internal error
  (`_bfd_merged_section_offset`). This is an environment/toolchain failure,
  not evidence that the contract tests passed or that GitHub's runner will
  encounter the same linker bug.

The initial temporary Linux filesystem filled during a reinstall. A dedicated
Docker volume is used for subsequent verification. That failure is recorded as
an environment limitation, not a passing install. Final app/integration results
will be recorded after the remaining reruns finish. No hosted CI run has been
triggered, so this branch must not be described as fully green.
