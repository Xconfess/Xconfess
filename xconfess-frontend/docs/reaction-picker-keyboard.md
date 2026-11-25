# Reaction picker: keyboard support

The reaction row on every confession card is now a keyboard-navigable
toolbar (`role="toolbar"` with an accessible name, `aria-label="Reactions"`
by default). Individual reactions keep their `aria-pressed` selected state
so screen readers announce the current toggle state as they do on any
button.

## Keybindings

Inside the picker (any reaction button focused):

| Key | Action |
| --- | --- |
| `ArrowRight` / `ArrowDown` | Focus next reaction, wraps at the end. |
| `ArrowLeft` / `ArrowUp` | Focus previous reaction, wraps at the start. |
| `Home` | Focus first reaction. |
| `End` | Focus last reaction. |
| `Enter` / `Space` | Toggle the focused reaction (handled by the button itself). |
| `Escape` | Blur the focused reaction and call the parent's `onEscape` (optional). |

No reaction is implicit; the picker never selects a value on focus.

## Files

- `xconfess-frontend/app/components/confession/ReactionPicker.tsx`
- `xconfess-frontend/app/components/confession/__tests__/ReactionPicker.test.tsx`
- `xconfess-frontend/app/components/confession/ConfessionCard.tsx` now renders a
  `<ReactionPicker>` instead of inlining two `<ReactionButton>`s.

The underlying `ReactionButton` keeps its optimistic state, rate-limit
toast and websocket counters — the picker only wires keyboard navigation.
