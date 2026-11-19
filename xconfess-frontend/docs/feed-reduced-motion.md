# Feed: reduced-motion handling

The confession feed respects the operating-system `prefers-reduced-motion`
setting on all transitions a user might trigger by default.

## Scope

- **Feed list fade on refetch.** Normally the virtualized list fades to
  `opacity: 0.7` while a background refetch is in flight. With reduced
  motion the transition is dropped entirely and the opacity change is
  suppressed — the swap is instant.
- **Programmatic scrolls** (`scrollToComposer`, `scrollToTop`,
  `scrollIntoView` from the keyboard shortcut navigator) switch from
  `behavior: "smooth"` to `behavior: "auto"`.
- **State transitions are preserved.** The feed still swaps content, the
  scroll still happens, the composer still gains focus — only the animation
  of those transitions is reduced.

Non-essential decorative CSS animations elsewhere are already muted by
`@media (prefers-reduced-motion: reduce)` blocks in `app/globals.css`.

## Hook

`app/lib/hooks/usePrefersReducedMotion.ts` exports a single hook,
`usePrefersReducedMotion()`, that reads
`window.matchMedia("(prefers-reduced-motion: reduce)")` and updates
reactively when the preference changes at runtime (OS setting toggled while
the tab is open). It returns `false` during SSR and the first client render,
matching the "no preference" default, so hydration never mismatches.

This hook replaces an earlier local copy that lived in
`ShortcutsProvider.tsx`; both call sites now share the same implementation.

## Automated verification

- `app/lib/hooks/__tests__/usePrefersReducedMotion.test.ts` covers the four
  behaviours: default `false`, initial `true`, live preference flips, and
  listener cleanup on unmount.
- Feed behaviour under reduced motion is observable via the
  `data-reduced-motion` attribute on the `role="feed"` wrapper in
  `ConfessionFeed.tsx`, which component tests can assert against.

## Manual verification

macOS: System Settings → Accessibility → Display → Reduce motion.
Windows 11: Settings → Accessibility → Visual effects → Animation effects.
In Chrome DevTools: open the Rendering tab, choose
"Emulate CSS media feature prefers-reduced-motion" → "reduce".
