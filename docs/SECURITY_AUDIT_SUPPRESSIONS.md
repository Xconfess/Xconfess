# Security Audit Suppressions

This file documents the rationale for each advisory suppressed in `audit-ci.json`.
All suppressions require a documented reason and a tracking issue.

**Policy:** Every suppression must include: the GHSA advisory ID, the affected package and dependency chain, why the fix is not applied, and an expiry date no more than 90 days from when the suppression was added. Suppressions expire on 2026-10-01 and must be re-evaluated then.

**Tracking issue:** https://github.com/Dataguru-tech/Xconfess/issues/1506

---

## tar (transitive via sqlite3)

All `tar` suppressions share the same root cause: `tar` is a transitive dependency of `sqlite3` (used by the backend) via the build chain `sqlite3 -> node-gyp -> cacache -> tar`. The fix requires upgrading `sqlite3` to v6, which is a semver-major breaking change. `tar` is only invoked during `npm install` in CI and local dev; it is **not** invoked at application runtime.

| GHSA | Title | Severity |
|------|-------|----------|
| GHSA-34x7-hfp2-rc4v | node-tar: Hardlink Path Traversal → Arbitrary File Creation/Overwrite | high |
| GHSA-8qq5-rm4j-mr97 | node-tar: Arbitrary File Overwrite via Insufficient Path Sanitization | high |
| GHSA-83g3-92jg-28cx | node-tar: Arbitrary File R/W via Hardlink Target Escape Through Symlink Chain | high |
| GHSA-qffp-2rhf-9h96 | node-tar: Hardlink Path Traversal via Drive-Relative Linkpath | high |
| GHSA-9ppj-qmqm-q256 | node-tar: Symlink Path Traversal via Drive-Relative Linkpath | high |
| GHSA-r6q2-hw4h-h46w | node-tar: Race Condition via Unicode Ligature Collisions on macOS APFS | high |
| GHSA-23hp-3jrh-7fpw | node-tar: Decompression/parse DoS via unlimited input | critical |
| GHSA-8x88-c5mf-7j5w | node-tar: Negative tar entry size causes infinite loop in archive replace | high |

**Mitigation:** sqlite3 v6 upgrade is blocked pending integration testing. Once validated, remove all GHSA-*tar* suppressions from `audit-ci.json`. Expires: 2026-10-01.

---

## nodemailer (direct dependency)

`nodemailer` is a direct dependency used for transactional email in the backend. The fix for all advisories below requires upgrading to nodemailer v9, which is a semver-major breaking change with transport API changes that require backend integration testing before upgrade.

| GHSA | Title | Severity |
|------|-------|----------|
| GHSA-c7w3-x93f-qmm8 | Nodemailer: SMTP command injection via unsanitized `envelope.size` | low |
| GHSA-vvjj-xcjg-gr5g | Nodemailer: SMTP command injection via CRLF in Transport name (EHLO/HELO) | moderate |
| GHSA-268h-hp4c-crq3 | Nodemailer: CRLF injection in List-* headers | moderate |
| GHSA-wqvq-jvpq-h66f | Nodemailer: jsonTransport bypasses disableFileAccess/disableUrlAccess | moderate |
| GHSA-r7g4-qg5f-qqm2 | Nodemailer: Improper TLS Certificate Validation in OAuth2 Token Fetch | moderate |
| GHSA-p6gq-j5cr-w38f | Nodemailer: Message-level raw option bypasses disableFileAccess/disableUrlAccess (SSRF/arbitrary file read) | high |

**Mitigation:** Upgrade to nodemailer v9 and test all email transport configurations (SMTP, OAuth2). The highest-severity advisory (GHSA-p6gq-j5cr-w38f) requires that `disableFileAccess` and `disableUrlAccess` options are explicitly set in all transport configs while the upgrade is pending. Expires: 2026-10-01.

---

## sharp (transitive via next.js)

`sharp` is a transitive dependency bundled with `next.js` (xconfess-frontend). The advisory GHSA-f88m-g3jw-g9cj covers inherited vulnerabilities in the bundled `libvips`. The `audit-ci` suggested fix is to downgrade `next` to v9.3.3, which is an extreme breaking regression from the current v16 series. The correct remediation is a next.js patch release that bundles an updated `sharp`/`libvips`. This is being tracked and should be resolved by the next next.js patch.

| GHSA | Title | Severity |
|------|-------|----------|
| GHSA-f88m-g3jw-g9cj | sharp: inherited libvips vulnerabilities (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591) | high |

**Mitigation:** Monitor next.js releases and upgrade as soon as a patch-level release bundles `sharp >= 0.35.0`. Expires: 2026-10-01.

---

## brace-expansion (transitive via archiver)

`brace-expansion` is a transitive dependency via `archiver v7 -> readdir-glob -> brace-expansion`. `archiver` is used in the backend data-export module. The fix requires upgrading to `archiver v8`, which is a semver-major breaking change. `brace-expansion` is only used in server-side export glob patterns for trusted internal paths — it is **not** exposed to untrusted user input.

| GHSA | Title | Severity |
|------|-------|----------|
| GHSA-3jxr-9vmj-r5cp | brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups | high |
| GHSA-f886-m6hf-6m8v | brace-expansion: Zero-step sequence causes process hang and memory exhaustion | moderate |

**Mitigation:** Upgrade `archiver` to v8 and validate data-export functionality. Expires: 2026-10-01.

---

## Suppression Lifecycle

When a suppression expires or the blocking issue is resolved:

1. Remove the GHSA ID from the `allowlist` in `audit-ci.json`.
2. Run `npm run audit:ci` locally to confirm CI will pass.
3. Update or remove the entry in this file.
4. If the upgrade cannot proceed, create a new tracking issue with a fresh rationale, add a new expiry, and re-add the suppression.
