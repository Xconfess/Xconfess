# Labels and Drips complexity (maintainers)

Quick reference for applying GitHub labels and **suggested Drips Wave complexity** consistently. For full triage workflow, see [WAVE_TRIAGE.md](./WAVE_TRIAGE.md).

---

## Suggested Drips complexity

Use these on issues when publishing to the Stellar Wave / Drips dashboard. They are **estimates for queue sizing and rewards**, not guarantees until a maintainer triages the issue.

| Suggested complexity | Typical effort | Drips points (Wave 5) |
|---|---|---|
| **Trivial** | Docs-only, templates, small copy, single-file chore with clear acceptance criteria | **100** |
| **Medium** | One subsystem, a few files, local tests required, no production-only steps | **150** (default mid-tier; confirm on dashboard) |
| **High** | Cross-cutting work, E2E/browser setup, contracts, or several modules with integration risk | **200** |

**How to choose**

- **Trivial** — A contributor can land it in under an hour with no surprises (e.g. issue template, PR template, maintainer doc).
- **Medium** — Standard feature or bug in one area; reviewer can verify with `npm` / `cargo` commands from the issue.
- **High** — Playwright/CI wiring, Soroban changes, or work that needs backend + frontend + careful validation.

Record the chosen tier in the issue body (and in the Wave issue template dropdown) so the dashboard stays aligned.

---

## Common area labels

Apply **one type**, **one or two subsystem** labels, and **one priority** before adding `Stellar Wave`. Names match GitHub labels in this repo.

### Type (exactly one)

| Label | Use when |
|---|---|
| `bug` | Incorrect behavior with a reproducible case |
| `feature` | New capability or intentional behavior change |
| `chore` | Refactor, deps, or tests with no user-facing change |
| `docs` | Documentation only |

### Subsystem (one or two)

| Label | Covers |
|---|---|
| `backend` | NestJS API, workers, auth, moderation |
| `frontend` | Next.js App Router, UI, proxy routes |
| `contracts` | Soroban workspace, build, deployment metadata |
| `stellar` | Horizon/RPC, anchor/tip flows |
| `ops` | CI, deployment, env config, runbooks |

### Priority (exactly one)

| Label | Meaning |
|---|---|
| `P0` | Blocks a core user flow |
| `P1` | Correctness/reliability; not happy-path blocking |
| `P2` | Meaningful improvement or feature |
| `P3` | Nice-to-have polish |

### Program and state

| Label | Use when |
|---|---|
| `Stellar Wave` | Issue is triaged, scoped, and **ready for external contributors** — apply only after the ready-for-contributors checklist in [WAVE_TRIAGE.md](./WAVE_TRIAGE.md) |
| `blocked` | Waiting on dependency, release, or maintainer decision |

---

## Stellar Wave label (required reminder)

Do **not** add `Stellar Wave` at filing time. After triage:

1. Complete scope, acceptance criteria, and validation steps.
2. Apply type + subsystem + priority labels.
3. Run the ready-for-contributors checklist in [WAVE_TRIAGE.md](./WAVE_TRIAGE.md).
4. Then add **`Stellar Wave`** so the issue appears in contributor queues and Drips.

Open Wave issues filter: `is:issue is:open label:"Stellar Wave"`.

---

## Related docs

| Document | Purpose |
|---|---|
| [WAVE_TRIAGE.md](./WAVE_TRIAGE.md) | Full triage lifecycle and publish checklist |
| [DASHBOARD_SYNC_CHECKLIST.md](./DASHBOARD_SYNC_CHECKLIST.md) | Keep GitHub and Drips dashboard in sync |
| [.github/ISSUE_TEMPLATE/wave.yml](../.github/ISSUE_TEMPLATE/wave.yml) | Short template for new Wave tasks |
