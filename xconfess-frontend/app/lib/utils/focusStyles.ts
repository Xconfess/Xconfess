/**
 * Shared keyboard-focus treatment for interactive controls.
 *
 * Scoped to `:focus-visible`, so the indicator is shown to keyboard users but
 * never to pointer/touch users — the appearance of links and buttons on mouse
 * or tap is unchanged. The outline uses the `--focus-ring` token (defined for
 * both the dark `:root` and the `.light` theme in `app/globals.css`) and an
 * offset, so it stays legible against the card's `--surface-overlay`,
 * `--surface` and `--surface-muted` fills.
 *
 * Prefer this over `focus:outline-none`: removing the outline without a
 * replacement indicator is an accessibility regression (see A11Y_CHECKLIST §4).
 */
export const focusVisible =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";
