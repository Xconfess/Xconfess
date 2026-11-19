# Message composer: discard-confirmation prompt

Discarding a substantial private message draft now requires explicit
confirmation (#2309). A short draft (below `discardConfirmThreshold`
trimmed characters, default 140) still discards immediately — the
confirmation is specifically for content a user is unlikely to want to
lose by miss-clicking the trash button.

## Props

| Prop | Default | Meaning |
| --- | --- | --- |
| `discardConfirmThreshold` | `DEFAULT_DISCARD_CONFIRM_THRESHOLD = 140` | Trimmed length (chars) at or above which a discard asks for confirmation. `0` always confirms; `Infinity` never confirms. |

The composer stays purely presentational: it calls the caller's `onDiscard`
on confirmation, nothing else. The caller still decides what "discard"
actually does with the draft (e.g. `useConversationDrafts.clearDraft`).

## Prompt shape

- `role="alertdialog"` with `aria-labelledby` + `aria-describedby`.
- Includes the exact character count so the user knows what they are
  about to lose.
- **Keep draft** is the primary, auto-focused button (safe default).
- **Discard draft** is a destructive variant.
- `Escape` closes the prompt without discarding.

## Failure safety

- The prompt never exposes draft content, only its length — mis-focused
  screen readers or logs cannot leak the message text.
- A discard confirmation can never trigger a send, and a send in flight
  (`isSending`) disables the trash button entirely so a race cannot
  destroy an in-flight message.

## Files

- `xconfess-frontend/app/components/messages/MessageComposer.tsx`
- `xconfess-frontend/app/components/messages/__tests__/MessageComposer.test.tsx`
  — new `discard confirmation (#2309)` describe block covers short vs. long
  drafts, Keep / Discard paths, Escape dismissal, and overriding the
  threshold.
