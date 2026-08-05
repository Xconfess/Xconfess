/**
 * AnchorButton.tsx
 * Issue #196 – Block anchor submission on network mismatch with actionable copy
 * Issue #198 – Prevent duplicate anchor verification submits
 * Issue #1476 – Support anchor status reconciliation (pending, confirmed, failed, stale, retry)
 *
 * Uses the real useStellarWallet contract:
 *   isLoading        (not isConnecting)
 *   isReady          (wallet connected + correct network)
 *   readinessError   (human-readable reason isReady is false)
 *   anchor(content)  (not signAndSubmitAnchorTx)
 */

"use client";

import React, { useCallback, useRef, useState } from "react";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

interface AnchorButtonProps {
  confessionId: string;
  content: string;
  initialStatus?: "idle" | "pending" | "confirmed" | "failed" | "stale";
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

type AnchorStatus = "idle" | "pending" | "confirmed" | "failed" | "stale";

export function AnchorButton({
  confessionId,
  content,
  initialStatus = "idle",
  onSuccess,
  onError,
}: AnchorButtonProps) {
  const wallet = useStellarWallet();
  const [status, setStatus] = useState<AnchorStatus>(initialStatus);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Guard against duplicate in-flight submits
  const inFlightRef = useRef(false);

  const handleAnchor = useCallback(async () => {
    if (inFlightRef.current || status === "pending") return;

    inFlightRef.current = true;
    setStatus("pending");
    setErrorMsg(null);

    try {
      await wallet.anchor(content);
      setStatus("confirmed");
      onSuccess?.();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      // Distinguish stale/failed states cleanly for users without exposing internal traces
      const isStaleError = e.message.toLowerCase().includes("stale") || e.message.toLowerCase().includes("timeout");
      setStatus(isStaleError ? "stale" : "failed");
      setErrorMsg(isStaleError ? "Anchor verification timed out or became stale. Please retry." : "Failed to anchor. Please try again.");
      onError?.(e);
    } finally {
      inFlightRef.current = false;
    }
  }, [content, onError, onSuccess, status, wallet]);

  // Not yet connected
  if (!wallet.isConnected) {
    return (
      <button
        type="button"
        onClick={wallet.connect}
        disabled={wallet.isLoading}
        className="anchor-btn anchor-btn--connect px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
      >
        {wallet.isLoading ? "Connecting…" : "Connect Wallet to Anchor"}
      </button>
    );
  }

  // Connected but not ready (network mismatch or other readiness failure)
  if (!wallet.isReady) {
    return (
      <div className="anchor-mismatch p-4 bg-amber-50 border border-amber-200 rounded-lg" role="alert">
        <p className="anchor-mismatch__message text-amber-800 text-sm mb-2 font-medium">
          {wallet.readinessError ??
            "Wallet is not ready. Please check your network in Freighter."}
        </p>
        <button
          type="button"
          className="anchor-btn anchor-btn--disabled px-4 py-2 bg-gray-200 text-gray-500 rounded-lg cursor-not-allowed text-sm font-medium"
          disabled
        >
          Anchor Confession
        </button>
      </div>
    );
  }

  return (
    <div className="anchor-action flex flex-col gap-2">
      <button
        type="button"
        onClick={handleAnchor}
        disabled={status === "pending" || status === "confirmed"}
        className={`anchor-btn px-4 py-2 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2 ${status === "confirmed"
            ? "bg-green-100 text-green-700 cursor-default"
            : status === "pending"
              ? "bg-blue-400 text-white cursor-wait"
              : status === "failed" || status === "stale"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        aria-busy={status === "pending"}
      >
        {status === "pending" && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Anchoring...
          </>
        )}
        {status === "confirmed" && (
          <>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            Confirmed On-Chain
          </>
        )}
        {status === "stale" && (
          <>
            <RefreshCw className="w-4 h-4" />
            Retry Stale Anchor
          </>
        )}
        {status === "failed" && (
          <>
            <RefreshCw className="w-4 h-4" />
            Retry Anchor
          </>
        )}
        {status === "idle" && "Anchor Confession"}
      </button>

      {(status === "failed" || status === "stale") && errorMsg && (
        <p className="anchor-action__error text-xs text-red-600 flex items-center gap-1" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {errorMsg}
        </p>
      )}
    </div>
  );
}