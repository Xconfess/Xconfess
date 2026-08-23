'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Displays a `x-request-id` value with a copy affordance.
 *
 * Surfacing the request ID lets users and maintainers trace failed auth
 * requests back to backend logs. Rendered compactly so it stays tidy on
 * mobile widths — a trimmed monospace value plus a copy button.
 *
 * @param requestId - The request correlation ID to display
 * @param label - Optional microcopy shown above the value (default "Request ID")
 */
export function RequestIdDisplay({
  requestId,
  label = 'Request ID',
}: {
  requestId: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!requestId || requestId.trim().length === 0) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context) — fall back to
      // selecting the text so the user can copy manually.
      const element = document.getElementById('auth-request-id-value');
      if (element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-left text-xs text-[var(--secondary)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--foreground)]"
        aria-label={`Copy ${label} ${requestId}`}
        title={`${label}: ${requestId}`}
      >
        <span className="shrink-0 font-medium">{label}:</span>
        <span
          id="auth-request-id-value"
          className="truncate font-mono text-[11px] tracking-tight"
        >
          {requestId}
        </span>
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <Copy
            className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
}