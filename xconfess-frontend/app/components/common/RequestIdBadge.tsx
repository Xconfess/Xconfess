'use client';

import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * RequestIdBadge — compact request ID display with a copy affordance.
 * Shown alongside auth error messages so users/maintainers can trace logs.
 * Stays compact on mobile (truncated ID + copy button).
 */
export function RequestIdBadge({ requestId }: { requestId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — select text instead
      setCopied(false);
    }
  }, [requestId]);

  const shortId =
    requestId.length > 16 ? `${requestId.slice(0, 8)}…${requestId.slice(-6)}` : requestId;

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-red-600/80">Request ID:</span>
      <code
        className="min-w-0 select-all truncate rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-700"
        title={requestId}
      >
        {shortId}
      </code>
      <button
        type="button"
        aria-label={copied ? 'Request ID copied' : 'Copy request ID'}
        title={copied ? 'Copied!' : 'Copy request ID'}
        onClick={copy}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-200 bg-white px-1.5 py-0.5 text-xs text-red-700 transition-colors hover:bg-red-100"
      >
        {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}