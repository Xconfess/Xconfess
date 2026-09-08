# Dependency Security Audit

Date: 2026-09-07

This record documents the dependency audit performed for GrantFox readiness.
It does not include fabricated usage, traction, or security claims.

## Scope

- Command: `npm audit --json`
- Runtime scope command: `npm audit --omit=dev --json`
- Local runtime: Node `v22.14.0`, npm `10.9.2`
- Repository runtime expectation: Node `22.x`

## Remediated Findings

- Kept backend and frontend `@stellar/stellar-sdk` on the compatible
  `14.6.1` release already validated by the Stellar integration layer, and
  forced the vulnerable transitive `toml` parser to patched `4.2.0` through the
  root override.
- Upgraded backend `sanitize-html` to `2.17.7`, resolving the stored XSS
  advisory affecting older `2.17.x` versions.
- Upgraded backend `uuid` resolution to `11.1.1`, resolving the buffer bounds
  advisory affecting `<11.1.1`.
- Upgraded backend `@swc/cli` to `0.8.1` and `@nestjs/schematics` to `11.1.0`.
- Added root overrides for patched transitive build dependencies:
  `browserslist@4.28.9`, `fast-uri@3.1.6`, `fflate@0.8.3`, `qs@6.16.0`, and
  `uuid@11.1.1`.

## Remaining Accepted Finding

`npm audit` and `npm audit --omit=dev` report two low-severity findings:

- `cookie <0.7.0` via `csurf`
- `csurf >=1.3.0` via bundled `cookie`

NPM's only automated fix is `npm audit fix --force`, which would install
`csurf@1.2.2` as a breaking downgrade. That is not production-safe for this
readiness branch.

Current compensating controls:

- CSRF protection uses signed server-side middleware with `sameSite: "strict"`.
- CSRF cookies are `secure` in production.
- Protected writes require the CSRF token header or body token.
- Webhook exemptions are explicitly tested for exact routes and traversal-like
  near misses.

Follow-up:

- Replace `csurf` with a maintained CSRF middleware in a dedicated security PR.
- Re-run `npm audit --omit=dev`, backend CSRF tests, backend build, and backend
  integration smoke tests after replacement.

## Current Audit Result

After the safe dependency updates:

- Critical: 0
- High: 0
- Moderate: 0
- Low: 2, both tied to `csurf`'s bundled `cookie` dependency
