'use client';

import { cn } from '@/app/lib/utils/cn';

/**
 * InlineError — small, non-blocking banner for form and data errors.
 *
 * Design goals (issue #2087):
 *  • Accessible: `role="alert"` + `aria-live="assertive"` so screen readers
 *    announce the message without requiring focus.
 *  • Concise: renders a single string; callers are responsible for choosing
 *    a user-friendly message (use `getErrorMessage()` from errorHandler).
 *  • Safe: never receives or displays raw backend payloads — only the
 *    normalised string that the caller has already sanitised.
 *  • Composable: optional `id` prop wires up `aria-describedby` on adjacent
 *    inputs; optional `className` allows one-off spacing overrides.
 */
export interface InlineErrorProps {
  /** Sanitised, user-facing error text. Renders nothing when falsy. */
  message: string | null | undefined;
  /**
   * Sets the `id` attribute so a sibling input can reference this element
   * via `aria-describedby`.
   */
  id?: string;
  /** Additional Tailwind classes for spacing / layout tweaks. */
  className?: string;
}

export function InlineError({ message, id, className }: InlineErrorProps) {
  if (!message) return null;

  return (
    <div
      id={id}
      role="alert"
      aria-live="assertive"
      data-testid="inline-error"
      className={cn(
        'rounded-xl border border-[var(--danger)]/25 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]',
        className,
      )}
    >
      {message}
    </div>
  );
}
