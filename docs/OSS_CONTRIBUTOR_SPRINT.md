# OSS contributor sprint

Use this guide to triage and publish small Xconfess tasks for external contributors.

## Label model

Every contributor-ready issue should have:

- one type label: `bug`, `feature`, `chore`, `docs`, or `test`
- one or two area labels: `frontend`, `backend`, `stellar`, `contracts`, `ops`, `security`, `ux`, `api`
- one priority label: `P0`, `P1`, `P2`, or `P3`
- optionally a program label: `Stellar Wave`, `GrantFox OSS`, `Maybe Rewarded`, `Official Campaign`

Use `good first issue` only when the contributor can complete the task without deep product context.
Use `help wanted` when maintainers want external implementation but the work may require reading code.

## Issue template

```md
## Problem
What is broken or missing?

## Scope
- File or module expected to change
- Any known constraints

## Acceptance criteria
- Observable outcome
- Tests or docs updated

## Validation
Run:
`npm run ...`
```

## Review expectations

- One issue per PR.
- Small PRs are preferred.
- Code PRs need focused tests.
- UI PRs need screenshots or a short screen recording.
- Deployment/ops PRs need a pasted command result or log excerpt.

## Suggested sprint order

1. Fix contributor docs and env setup gaps.
2. Add auth and proxy route tests.
3. Add backend health and schema validation tests.
4. Add Stellar contract env and testnet smoke checks.
5. Improve deployed smoke tests and CI gates.
