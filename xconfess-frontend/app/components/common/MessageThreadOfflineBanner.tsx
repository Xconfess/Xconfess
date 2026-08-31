"use client";

import { RefreshCcw, WifiOff } from "lucide-react";
import type { ReadReceiptConnectionState } from "@/app/lib/hooks/useReadReceipts";

interface Props {
  state: ReadReceiptConnectionState;
}

/**
 * Compact banner shown inside a message thread when the read-receipt socket
 * is offline. Disappears as soon as the connection is restored.
 */
export function MessageThreadOfflineBanner({ state }: Props) {
  if (state === "connected") return null;

  const isReconnecting = state === "reconnecting";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-200 text-xs"
    >
      {isReconnecting ? (
        <RefreshCcw className="w-3.5 h-3.5 animate-spin flex-shrink-0" aria-hidden />
      ) : (
        <WifiOff className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
      )}
      <span>
        {isReconnecting
          ? "Reconnecting — read receipts updating via polling…"
          : "Live updates unavailable — using polling fallback."}
      </span>
    </div>
  );
}
