<!--
  Small PR policy: https://github.com/Xconfess/Xconfess/blob/main/docs/SMALL_PR_POLICY.md
  Keep this PR focused on ONE issue. Fill in every section — mark unused ones N/A.
-->

## Closes

Closes #<!-- issue number -->

---

## What changed

<!-- One paragraph. What does this PR do? -->

## Why

<!-- One sentence. What problem does this solve, or what does it enable? -->

## How to test

<!-- Step-by-step instructions from a fresh checkout. Include env vars or feature flags if needed. -->

1. 
2. 
3. 

---

## Scope check

<!-- Tick every box that applies. If none apply, explain below. -->

- [ ] This PR touches only the files needed to resolve the linked issue
- [ ] I have not included unrelated refactors, style fixes, or dependency upgrades
- [ ] Changed lines ≤ 400 and files touched ≤ 8 (excluding lockfiles and generated files)

If this PR is necessarily larger, explain why it cannot be split:

---

## Evidence

### Tests

<!-- Tick what applies. -->

- [ ] Added or updated unit tests
- [ ] Added or updated integration / e2e tests
- [ ] Change is not testable — manual steps provided above
- [ ] No runtime behaviour changed (docs / config only)

Test run output (paste or screenshot):

```
# paste npm run backend:test / frontend:test / contract:test output here
```

### Screenshots (UI changes only)

<!-- Required for any visible UI change. Delete this section for non-UI PRs. -->

| | Before | After |
|---|---|---|
| Desktop (≥ 1280 px) | | |
| Mobile (≤ 390 px) | | |

---

## Checklist

- [ ] Branch is up to date with `main`
- [ ] All CI checks pass
- [ ] PR description is complete (no empty sections)
- [ ] I have read the [small PR policy](../docs/SMALL_PR_POLICY.md)