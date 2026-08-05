# ADR-005: Monorepo Structure with npm Workspaces

## Status

Accepted

## Context

xConfess has three distinct packages: a NestJS backend (xconfess-backend), a Next.js frontend (xconfess-frontend), and Soroban Rust contracts (xconfess-contracts). These packages share no runtime code but are developed together. Contributors need to be able to work across all three without switching repositories.

## Options Considered

- **Option A — Separate repositories**: Each package in its own repo. Clear boundaries but contributors must clone and coordinate multiple repos. Cross-cutting PRs are harder to review.
- **Option B — npm workspaces monorepo**: Single repository with a root package.json defining workspaces. Each package manages its own dependencies and scripts through one root lock file.
- **Option C — Turborepo or Nx**: Managed monorepo tooling with build caching and task orchestration. More powerful but adds tooling complexity for a project at this stage.

## Decision

We chose **Option B** — a single repository with each package as an independent workspace.

A single repo makes cross-cutting changes (e.g. updating an API contract that affects both backend and frontend) visible in one PR. npm workspaces keep package dependencies isolated without requiring a full monorepo build tool. The Rust contracts use Cargo and are independent of the JS workspace.

## Consequences

### Positive

- Cross-cutting changes are reviewed in a single PR
- Single git history makes it easy to correlate backend and frontend changes
- No extra tooling required beyond npm workspaces

### Negative

- CI pipelines must detect which packages changed and run only the relevant tests
- All JavaScript packages share one root npm lock file, so contributors should run workspace commands from the root
- No shared build cache — each package builds independently

## References

- /package.json (root workspace definition)
- /xconfess-backend/package.json
- /xconfess-frontend/package.json
- /xconfess-contracts/Cargo.toml
