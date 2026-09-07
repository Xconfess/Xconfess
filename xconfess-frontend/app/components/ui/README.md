# Deprecated: app/components/ui

This directory is **deprecated**. It duplicates the canonical shared primitives
in `xconfess-frontend/components/ui`.

## What to do instead

- New shared UI primitives belong in `xconfess-frontend/components/ui` (the
  `shadcn`-managed source of truth declared in `components.json`).
- New app-local composites belong in `xconfess-frontend/app/components` (any
  subfolder **except** `ui`).

See `xconfess-frontend/docs/UI_COMPONENT_OWNERSHIP.md` for the full audit, the
ownership rule, and the migration plan (issue #1801).

## Status of files here

| File | Action |
| --- | --- |
| `badge.tsx` | Migrate call sites to `components/ui/badge.tsx`, then delete |
| `button.tsx` | Migrate call sites to `components/ui/button.tsx`, then delete |
| `card.tsx` | Migrate call sites to `components/ui/card.tsx`, then delete |
| `checkbox.tsx` | Migrate call sites to `components/ui/checkbox.tsx`, then delete |
| `input.tsx` | Migrate call sites to `components/ui/input.tsx`, then delete |
| `table.tsx` | Migrate call sites to `components/ui/table.tsx`, then delete |
| `modal.tsx` | Reimplement on canonical `dialog.tsx`, then delete |

Do not add new files to this directory.
