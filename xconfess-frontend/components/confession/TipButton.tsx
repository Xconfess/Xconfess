/**
 * TipButton.tsx
 * Unified wallet and tipping implementation
 */

"use client";

import React, { useCallback, useRef, useState } from "react";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { Button } from "@/components/ui/button";

interface AnchorButtonProps {
  confessionId: string;
  content: string;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

type SubmitState = "idle" | "pending" | "success" | "error";

export function AnchorButton({
  confessionId,
  content,
  onSuccess,
  onError,
}: AnchorButtonProps) {
  const wallet = useStellarWallet();
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Issue #198 – guard against duplicate in-flight submits
  const inFlightRef = useRef(false);

  const handleAnchor = useCallback(async () => {
    if (inFlightRef.current || submitState === "pending") return;

    inFlightRef.current = true;
    setSubmitState("pending");
    setErrorMsg(null);

    try {
      await wallet.anchor(content);
      setSubmitState("success");
      onSuccess?.();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setSubmitState("error");
      setErrorMsg(e.message);
      onError?.(e);
    } finally {
      inFlightRef.current = false;
    }
  }, [content, onError, onSuccess, submitState, wallet]);

  // Not yet connected
  if (!wallet.isConnected) {
    return (
      <Button
        type="button"
        onClick={wallet.connect}
        disabled={wallet.isLoading}
        aria-label="Connect wallet to anchor"
        className="anchor-btn anchor-btn--connect"
      >
        {wallet.isLoading ? "Connecting…" : "Connect Wallet to Anchor"}
      </Button>
    );
  }

  // Issue #196 – connected but not ready (network mismatch or other readiness failure)
  if (!wallet.isReady) {
    return (
      <div className="anchor-mismatch" role="alert">
        <p className="anchor-mismatch__message">
          {wallet.readinessError ??
            "Wallet is not ready. Please check your network in Freighter."}
        </p>
        <Button type="button" className="anchor-btn anchor-btn--disabled" disabled aria-label="Anchor confession disabled">
          Anchor Confession
        </Button>
      </div>
    );
  }

  return (
    <div className="anchor-action">
      <Button
        type="button"
        onClick={handleAnchor}
        // Issue #198 – disabled while in-flight
        disabled={submitState === "pending" || submitState === "success"}
        className={`anchor-btn anchor-btn--${submitState}`}
        aria-label="Anchor confession"
        aria-busy={submitState === "pending"}
      >
        {submitState === "pending" && "Anchoring…"}
        {submitState === "success" && "Anchored ✓"}
        {(submitState === "idle" || submitState === "error") &&
          "Anchor Confession"}
      </Button>
      {submitState === "error" && errorMsg && (
        <p className="anchor-action__error" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
