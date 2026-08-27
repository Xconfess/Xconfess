# Wave Issue Triage Guide

This guide is for maintainers. It covers how to evaluate, label, scope, and
prioritize issues before they are published as Stellar Wave contributions.
Keep it separate from the operational runbooks in `docs/` — those are for
running the system, this is for managing the contributor pipeline.

---

## What Is a Wave Issue

xConfess participates in Stellar Wave, an SDF program that connects external
contributors with open-source Stellar ecosystem projects. A Wave issue is an
issue the maintainer team has deliberately prepared for an external contributor:
scoped tightly enough that someone unfamiliar with the codebase can land a
correct, reviewable PR in a single sitting without needing to ask clarifying
questions.

Not every issue in the backlog is a Wave candidate. The `Stellar Wave` label is
a deliberate signal, not a default. It is applied only after the issue passes
the ready-for-contributors checklist at the bottom of this guide.

---

## Triage Lifecycle

```
Intake → Assess eligibility → Label → Scope → Prioritize → Publish
```

Work through the stages in order. An issue that skips scoping will produce
unclear PRs and wasted review time.

---

## Stage 1 — Intake

When a new issue lands (filed by the team, raised by a contributor, or promoted
from the internal backlog), answer these questions before touching any labels:

**Is the problem clearly real?**
Can you reproduce it, or point to the specific gap in the codebase? If not,
gather evidence first. Do not triage hypotheticals.

**Is it self-contained?**
The work should be completable without depending on an unreleased internal
change, an in-flight migration, or a contract upgrade that has not yet been
deployed. If it is blocked, add `blocked` and a comment explaining what it is
waiting on. Come back to it after the blocker resolves.

**Does it touch Stellar-specific surfaces?**
Issues that involve Soroban contracts, the Stellar anchor flow, anonymous
tipping, chain reconciliation, or the `stellar` / `tipping` backend modules are
natural Wave candidates because they map directly to the program's scope.
Issues that are entirely internal infrastructure (database migrations, CI
plumbing, secret rotation) are generally not Wave material.

**Is it safe to share externally?**
The issue text and any linked runbook excerpts must not contain production
credentials, internal IP addresses, or sensitive user data. Sanitize before
publishing.

If the issue passes all four questions, continue. If it fails any of them,
resolve the blocker or close as invalid before proceeding.

---

## Stage 2 — Labeling

Every triaged issue gets exactly one label from each of the three required
groups before it leaves the triage queue. The `Stellar Wave` label is added
separately only at the end of Stage 5.

### Type (pick one)

| Label | When to use |
|---|---|
| `bug` | Observable incorrect behavior with a reproducible case |
| `feature` | New capability or an intentional extension of existing behavior |
| `chore` | Refactor, dependency update, or test coverage with no behavior change |
| `docs` | Documentation only, no code change |

### Subsystem (pick one or two at most)

| Label | Covers |
|---|---|
| `backend` | NestJS API, queue workers, auth, moderation |
| `frontend` | Next.js App Router, proxy routes, UI components |
| `contracts` | Soroban Rust workspace, build artifacts, deployment metadata |
| `stellar` | On-chain interaction, Horizon/RPC integration, anchor/tip flows |
| `ops` | CI, deployment, environment configuration, runbooks |

### Priority

| Label | Meaning |
|---|---|
| `P0` | Blocks a core user flow (confession creation, anchoring, tipping, auth). Fix before next release. |
| `P1` | Correctness or reliability issue that does not block the happy path but creates support burden or data risk. Target the next regular release. |
| `P2` | Meaningful improvement or new feature. No hard deadline. |
| `P3` | Nice-to-have: refactor, test coverage, docs polish. Pick up when bandwidth allows. |

When in doubt between two priorities, choose the higher one. It is easier to
move an issue down than to explain to a contributor why a P3 turned out to be
blocking.

---

## Stage 3 — Scoping

A Wave issue is a contract with the contributor. The scope section defines
exactly what is in and what is out. Ambiguous scope is the single most common
reason Wave PRs miss the mark.

### Write a tight problem statement

One or two sentences. State what is wrong (for bugs) or what capability is
missing (for features). Do not include implementation suggestions in the
problem statement — those go in the scope section.

### Define the scope explicitly

List what the issue covers. Then add an explicit **Out of scope** subsection
listing things a contributor might reasonably attempt that you do not want in
this PR. Common out-of-scope items:

- Changes to adjacent subsystems not needed for correctness
- Performance optimizations beyond what is required to pass tests
- UI polish that is not part of the acceptance criteria
- Updating runbooks or deployment docs unless the issue specifically calls for it

### List the expected files

Name the files or directories the contributor should expect to touch. This is
not a mandate — a contributor may find a cleaner approach — but it orients them
and lets reviewers spot a PR that has grown out of scope. Use the same format
as the existing issues in `maintainer/issues/`:

```
## Files
- `xconfess-backend/src/tipping/*`
- `xconfess-backend/src/stellar/*`
```

### Write testable acceptance criteria

Each criterion should be a statement a reviewer can verify without running
production infrastructure. Prefer statements of observable behavior over
statements of implementation:

Good: "Repeated verification of the same `txHash` does not create a second tip
record."

Not good: "Add an idempotency check to the verify service."

### Write a How to Test section

Give the contributor the exact local steps to verify their work. Reference
`compose.yaml` for local Postgres and Redis. Reference `npm run dev` or the
relevant workspace test command. If the scenario requires seeding specific
state, describe how to do it. See the existing issue files for examples:

- `maintainer/issues/170-fix-backend-tip-verification-idempotency-replay.md`
- `maintainer/issues/173-feat-backend-chain-reconciliation-worker.md`

---

## Stage 4 — Prioritization

Use these rules to order the Wave queue when multiple issues are ready at the
same time.

**Correctness before features.** A `P1 bug` always outranks a `P2 feature`,
regardless of how interesting the feature is.

**Smaller scope before larger scope at equal priority.** An issue that touches
one module and has three acceptance criteria will attract more contributors and
close faster than one that touches five modules and has eight criteria. If an
issue is large, split it before publishing.

**Unblocked before blocked.** An issue waiting on an unreleased dependency
should not be in the Wave queue even if it is P0. Mark it `blocked` and remove
it from the active queue until the dependency ships.

**Stellar-core flows first.** Among issues at the same priority and similar
scope, prefer those that strengthen the Stellar anchoring, tipping, and
contract surfaces. These align most directly with the Wave program's purpose
and are most likely to attract contributors with the right background.

**Avoid queuing more than five Wave issues at once.** A long queue signals to
contributors that issues are stale or unattended. Keep the active Wave queue
short and well-maintained rather than large and neglected.

---

## Stage 5 — Publish

Before applying the `Stellar Wave` label and making the issue visible to
external contributors, work through the checklist below. Every item must be
checked. If any item is not checked, the issue is not ready.

---

## Ready-for-Contributors Checklist

Use this checklist as a final gate. Copy it into an internal comment on the
issue as a paper trail, or verify it here before applying the `Stellar Wave`
label.

### Content

- [ ] The issue has a one-paragraph summary that states the problem or
      capability gap clearly enough that someone new to the repo can understand
      it without reading source code first.
- [ ] The problem statement is factual and reproducible (for bugs) or tied to a
      concrete use case (for features).
- [ ] The scope section lists what is in scope and explicitly calls out at least
      one thing that is out of scope.
- [ ] The Files section names the modules or directories expected to change.
- [ ] Every acceptance criterion is testable locally without production access.
- [ ] The How to Test section gives step-by-step instructions that work against
      `compose.yaml` plus `npm run dev`.
- [ ] No production credentials, internal hostnames, or sensitive user data
      appear anywhere in the issue text.

### Dependencies

- [ ] The issue does not depend on an unreleased internal change, in-flight
      migration, or contract upgrade.
- [ ] The issue does not assume the contributor has permissions or environment
      access beyond a standard local development setup.
- [ ] If the issue references a runbook in `docs/`, the referenced section
      exists and is current.

### Labels and Index

- [ ] The issue has exactly one type label, at least one subsystem label, and
      exactly one priority label.
- [ ] The priority label reflects what the issue actually blocks, not what
      would be convenient.
- [ ] The issue is linked in `maintainer/BACKLOG_INDEX.md` under the correct
      subsystem heading.
- [ ] A maintainer other than the author has read the issue in full and agreed
      it is ready.

### Final gate

- [ ] The `Stellar Wave` label has not been applied yet. Apply it now only
      after every box above is checked.

---

## What Makes an Issue a Poor Wave Candidate

Not every valuable issue is suitable for external contributors. Hold these back
from the Wave queue:

**Requires production access or on-call context.** If the only way to verify
the fix is to observe behavior on the live system, the issue belongs in the
internal backlog.

**Depends on institutional knowledge.** If the correct solution requires
understanding a past decision that is not written down anywhere, document that
decision first, then re-evaluate.

**Scope is inherently open-ended.** Investigations, architectural decisions, and
"improve X generally" issues are not Wave material. Decompose them into concrete
deliverables first.

**Touches secrets, keys, or sensitive configuration.** Even if the task itself
is benign, do not publish issues that require working with production keys,
wallet seeds, or internal service credentials.

**Already has an assignee or an open PR.** Do not add `Stellar Wave` to an
issue that is already in flight. It creates confusion about who owns the work.

---

## Relationship to Other Maintainer Docs

| Document | Purpose |
|---|---|
| `maintainer/LABELS_AND_COMPLEXITY.md` | Label groups and suggested Drips complexity (Trivial / Medium / High) |
| `maintainer/BACKLOG_INDEX.md` | Routing index for all tracked follow-up work |
| `maintainer/WAVE_5_CONTRIBUTOR_ASSIGNMENT.md` | Process for assigning and managing Wave 5 contributors |
| `maintainer/issues/*.md` | Authoritative scope and acceptance criteria per issue |
| `docs/` (all files) | Operational runbooks for running and releasing the system |

The triage guide (this file) is concerned with the health of the contributor
pipeline. The runbooks in `docs/` are concerned with the health of the running
system. These are separate concerns and should stay in separate files.

If a Wave issue requires a contributor to consult a runbook, link the specific
section rather than the whole document. Do not copy runbook content into the
issue.