"use client";

import { WifiOff, RefreshCcw, X } from "lucide-react";
import type { ConnectionState } from "@/app/lib/hooks/useWebSocket";

interface Props {
  state: ConnectionState;
  reconnectAttempts: number;
  maxAttempts?: number;
  onDismiss?: () => void;
}

export function WebSocketReconnectBanner({
  state,
  reconnectAttempts,
  maxAttempts = 10,
  onDismiss,
}: Props) {
  if (state === 'connected' || state === 'connecting') return null;

  const isExhausted = state === 'disconnected' && reconnectAttempts >= maxAttempts;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm"
    >
      <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-[0_12px_30px_-24px_rgba(20,16,30,0.55)]">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-1.5 text-[var(--secondary)]">
            {state === 'reconnecting' ? (
              <RefreshCcw className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <WifiOff className="w-4 h-4" aria-hidden />
            )}
          </div>
          <div className="flex-grow min-w-0">
            <p className="font-semibold text-sm leading-tight">
              {isExhausted ? 'Live updates unavailable' : 'Reconnecting…'}
            </p>
            <p className="text-[11px] opacity-70 mt-0.5 leading-tight">
              {isExhausted
                ? 'Reload the page to resume live updates.'
                : `Attempt ${reconnectAttempts} of ${maxAttempts}`}
            </p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="flex-shrink-0 opacity-40 hover:opacity-100 transition-opacity p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
