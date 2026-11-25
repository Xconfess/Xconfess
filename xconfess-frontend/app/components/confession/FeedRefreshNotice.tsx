"use client";

import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { focusVisible } from "@/app/lib/utils/focusStyles";

export interface FeedRefreshNoticeProps {
  /** Human readable reason the refresh failed. */
  message: string;
  /** Called when the user asks to try loading the feed again. */
  onRetry: () => void | Promise<void>;
  /** Called when the user wants to hide the notice without retrying. */
  onDismiss?: () => void;
  /** True while a retry is in flight. */
  isRetrying?: boolean;
}

/**
 * Inline notice shown when a feed refresh fails but the previously loaded
 * confessions are still on screen.
 *
 * Replacing the whole feed with an error page would throw away content the
 * user can still read, so the failure is reported in a banner instead. The
 * retry button is disabled while a request is in flight so a double click
 * cannot start a second request.
 */
export function FeedRefreshNotice({
  message,
  onRetry,
  onDismiss,
  isRetrying = false,
}: FeedRefreshNoticeProps) {
  return (
    <div
      role="alert"
      data-testid="feed-refresh-notice"
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-semibold text-[var(--foreground)]">
            Could not refresh the feed
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--secondary)]">
            {message}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void onRetry();
          }}
          disabled={isRetrying}
          aria-busy={isRetrying}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60",
            focusVisible,
          )}
        >
          <RefreshCw
            className={cn("h-4 w-4", isRetrying && "animate-spin")}
            aria-hidden="true"
          />
          {isRetrying ? "Retrying..." : "Retry"}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={isRetrying}
            aria-label="Dismiss refresh error"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60",
              focusVisible,
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

export default FeedRefreshNotice;
