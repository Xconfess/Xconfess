# Small PR policy

> Wave 5 contributor guide · [Back to contributing](../README.md#contributing)

Keep every pull request focused on **one issue, one concern**. Small PRs are reviewed faster, reverted more safely, and produce a cleaner git history.

---

## Expected scope

A well-scoped PR does one of the following — not several at once:

| Type | What it contains |
|---|---|
| Bug fix | The minimal change that fixes the reported behaviour, plus a test that would have caught it |
| Feature | The code for the described feature, its unit/integration tests, and any docs it needs |
| Documentation | Prose changes only — no code changes in the same PR |
| Refactor | Structure or naming changes only — no behaviour changes, no new features |
| Dependency update | The lockfile change and any required call-site updates — nothing else |

If your work naturally spans more than one of these categories, split it into separate PRs and note the dependency order in each description.

---

## Size guidelines

These are not hard limits, but PRs that exceed them **will be asked to split** before review begins:

- **≤ 400 lines changed** (additions + deletions, excluding generated files and lockfiles)
- **≤ 8 files touched** (excluding lock files and auto-generated files)
- **One logical concern** — a reviewer should be able to summarise the PR in a single sentence

If your change is genuinely larger (e.g. a new module with its own tests and migration), leave a note explaining why it cannot be split. Maintainers will decide whether to proceed or request a split.

---

## What does not belong in a contributor PR

- Unrelated refactors spotted while working on the issue
- Style fixes in files you did not otherwise touch
- Dependency upgrades bundled with feature work
- Moving or renaming files that are not part of the issue scope
- Changes to CI configuration unless the issue explicitly requires it

If you notice something that should be fixed, open a separate issue and link it from your PR description. Do not fix it in the same PR.

---

## Evidence requirements

### Code changes
Every PR that changes runtime behaviour must include at least one of the following:

- A new or updated **unit test** that covers the changed logic
- A new or updated **integration/e2e test** for the affected flow
- A clear explanation in the PR description of why the change is inherently untestable, with a manual test step the reviewer can follow

Tests must pass locally before you open the PR:

```bash
# Backend
npm run backend:test

# Frontend
npm run frontend:test

# Contracts
npm run contract:test
```

### UI changes
Every PR that changes a visible user interface must include:

- **Before and after screenshots** embedded directly in the PR description (not linked to an external host)
- Screenshots must show the changed state on both **desktop** (≥ 1280 px) and **mobile** (≤ 390 px) viewport widths
- If the change is interactive (modal, toast, animation), a short screen recording or GIF is preferred over static screenshots

Screenshots taken against `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` are acceptable for local review.

---

## How to structure your PR description

Use the [PR template](../.github/PULL_REQUEST_TEMPLATE.md) — it is pre-filled when you open a pull request. Fill in every section; do not delete sections that do not apply, mark them `N/A` instead so reviewers know you considered them.

Minimum required content:

1. **Closes** — the issue number this PR resolves (`Closes #123`)
2. **What changed** — one paragraph, plain English, no jargon
3. **Why** — a sentence explaining the motivation if it is not obvious from the issue
4. **How to test** — step-by-step instructions a reviewer can follow from a fresh checkout
5. **Screenshots / test output** — as described above

---

## Flagging a PR for review

Once your PR meets all of the above:

1. Ensure the branch is up to date with `main`
2. All CI checks are green
3. Leave the **Ready for Review** comment using the template in `maintainer/READY_FOR_REVIEW_TEMPLATE.md`

Do not request a review directly — use the comment template so maintainers can triage consistently.

---

## Enforcement

PRs that do not meet this policy will receive a `needs: split` or `needs: evidence` label and will not be merged until the issues are resolved. This is not a penalty — it is how we keep the review queue healthy for everyone.
