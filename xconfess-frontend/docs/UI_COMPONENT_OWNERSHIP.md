# UI Component Ownership

This document resolves the duplicate `components/ui` and `app/components/ui`
directories tracked in issue #1801.

## Ownership rule

| Purpose | Directory | Source of truth |
| --- | --- | --- |
| Shared design-system primitives (buttons, inputs, cards, badges, etc.) | `xconfess-frontend/components/ui` | **Canonical.** Generated and managed by `shadcn` (`components.json` points here). |
| App-local composites/layouts that are NOT generic primitives | `xconfess-frontend/app/components` (any subfolder except `ui`) | App code. |

**New shared primitives MUST be added to `components/ui`, not `app/components/ui`.**

`app/components/ui` is **deprecated**. It was an early, hand-rolled duplicate of
the canonical `components/ui` primitives (different styling tokens, different
APIs). Do not add new files there.

## Inventory of duplicates

`app/components/ui` contains 7 files. Six overlap with canonical primitives and
one (`modal.tsx`) is app-only.

| File in `app/components/ui` | Canonical in `components/ui` | Status |
| --- | --- | --- |
| `badge.tsx` | `badge.tsx` | Duplicate — deprecated |
| `button.tsx` | `button.tsx` | Duplicate — deprecated |
| `card.tsx` | `card.tsx` | Duplicate — deprecated |
| `checkbox.tsx` | `checkbox.tsx` | Duplicate — deprecated |
| `input.tsx` | `input.tsx` | Duplicate — deprecated |
| `table.tsx` | `table.tsx` | Duplicate — deprecated |
| `modal.tsx` | — (use `dialog.tsx` / `sheet.tsx`) | App-only — deprecated; migrate to canonical `dialog.tsx` |

## Migration plan

1. **Stop the bleed.** No new components go in `app/components/ui`. New shared
   primitives use `components/ui`.
2. **Migrate call sites incrementally.** For each importer of
   `@/app/components/ui/*`, switch to the canonical `@/components/ui/*` and adjust
   for the (shadcn) API/style differences. The canonical components are the
   tested, standardized primitives.
3. **Remove `app/components/ui`** once all call sites are migrated. `modal.tsx`
   should be reimplemented on top of canonical `dialog.tsx` before removal.

### Low-risk first steps
- `checkbox.tsx`, `table.tsx`, and `badge.tsx` each have a single canonical
  counterpart and a small number of call sites, making them good first targets.
- Prefer migrating page-by-page behind normal PRs rather than a single large
  sweep, to keep visual-regression diffs reviewable.

## Rationale

Two parallel primitive sets cause inconsistent styling, duplicated maintenance,
and confusion about which component is authoritative. Consolidating on
`components/ui` (shadcn-managed, under `components.json`) gives one tested source
of truth for shared UI.
