# Accessibility Checklist for New UI Components (#2233)

Baseline expectations for any new or changed component under
`xconfess-frontend/components/ui` or `xconfess-frontend/app/components`.

## Expectations

- **Keyboard**: every interactive element (button, link, custom control) is
  reachable and operable with Tab/Shift+Tab, and activates with Enter/Space.
  No keyboard trap — focus must always be able to leave the component.
- **Focus**: focus has a visible indicator (don't suppress the default
  outline without replacing it). Opening a modal/dialog moves focus into it;
  closing it returns focus to the trigger element.
- **Contrast**: text and interactive elements meet WCAG AA (4.5:1 for normal
  text, 3:1 for large text/icons) against their background in both light and
  dark mode.
- **Screen reader**: meaningful images have `alt` text; icon-only buttons have
  an `aria-label`; dynamic status/error messages use `role="status"` or
  `role="alert"` so they're announced without the user needing to find them.

## Manual test checklist (run before merging a new/changed component)

- [ ] Tab through the component with no mouse; confirm every control is
      reachable and nothing is skipped or trapped.
- [ ] Trigger it with Enter/Space only (no click).
- [ ] Check focus is visible at every stop, and returns sensibly after
      closing an overlay.
- [ ] Run a contrast checker on text/icon colors in both themes.
- [ ] Skim it with a screen reader (VoiceOver/NVDA) or the browser's
      accessibility tree inspector; confirm labels and live regions make sense
      out loud.

See [UI Component Ownership](../xconfess-frontend/docs/UI_COMPONENT_OWNERSHIP.md)
for where new shared primitives belong.
