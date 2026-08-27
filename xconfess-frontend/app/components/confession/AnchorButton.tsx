"use client";

import { useState, type FC } from "react";
import { Anchor, CheckCircle2, ExternalLink, Loader2, AlertCircle, Wallet, RotateCcw } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils/cn";
import { useActivityStore } from "@/app/lib/store/activity.store";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { getWalletCTAState } from "@/lib/hooks/useWalletCTAState";
import { getStellarExplorerUrl, mapAnchorApiError } from "@/app/lib/utils/stellar";

type AnchorStatus = "idle" | "pending" | "confirmed" | "failed";

interface AnchorButtonProps {
  confessionId: string;
  confessionContent: string;
  isAnchored?: boolean;
  stellarTxHash?: string | null;
  onAnchorSuccess?: (txHash: string) => void;
  className?: string;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 6)}…${hash.slice(-6)}`;
}

export const AnchorButton: FC<AnchorButtonProps> = ({
  confessionId,
  confessionContent,
  isAnchored = false,
  stellarTxHash = null,
  onAnchorSuccess,
  className,
}) => {
  const {
    isAvailable,
    isConnected,
    isReady,
    readinessError,
    connect,
    anchor,
    isLoading,
  } = useStellarWallet();
  const walletCTA = getWalletCTAState({
    isFreighterInstalled: isAvailable,
    isConnected,
    isReady,
    readinessError,
    isLoading,
  });

  const addActivity = useActivityStore((s) => s.addActivity);
  const updateActivity = useActivityStore((s) => s.updateActivity);

  const [status, setStatus] = useState<AnchorStatus>(
    isAnchored && stellarTxHash ? "confirmed" : "idle",
  );
  const [txHash, setTxHash] = useState<string | null>(stellarTxHash);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const isPending = status === "pending";

  const handleAnchor = async () => {
    if (isPending || isLoading) return;
    setError(null);
    setStatus("pending");
    setLiveMessage("Anchoring confession on Stellar…");

    if (!isConnected) {
      try {
        await connect();
      } catch {
        const msg = "Failed to connect wallet. Please ensure Freighter is unlocked.";
        setError(msg);
        setStatus("failed");
        setLiveMessage(msg);
        return;
      }
    }

    const activityId = uuidv4();
    addActivity({
      id: activityId,
      type: "anchor",
      status: "requested",
      createdAt: Date.now(),
      confessionId,
    });

    try {
      const result = await anchor(confessionContent);

      if (!result.success || !result.txHash) {
        updateActivity(activityId, { status: "failed", updatedAt: Date.now() });
        const msg = result.error || "Failed to anchor confession";
        setError(msg);
        setStatus("failed");
        setLiveMessage(msg);
        return;
      }

      updateActivity(activityId, {
        status: "submitted",
        txHash: result.txHash,
      });

      const response = await fetch(`/api/confessions/${confessionId}/anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stellarTxHash: result.txHash }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          mapAnchorApiError(response.status, data?.message),
        );
      }

      // Handle idempotent replay: a pending anchor already exists for this confession
      if (data?.anchorPending && data?.stellarTxHash) {
        updateActivity(activityId, {
          status: "submitted",
          txHash: data.stellarTxHash,
        });
        setTxHash(data.stellarTxHash);
        setStatus("confirmed");
        setLiveMessage("Confession anchor is pending on-chain.");
        onAnchorSuccess?.(data.stellarTxHash);
        return;
      }

      updateActivity(activityId, {
        status: "confirmed",
        updatedAt: Date.now(),
      });

      setTxHash(result.txHash);
      setStatus("confirmed");
      setLiveMessage("Confession anchored successfully.");
      onAnchorSuccess?.(result.txHash);
    } catch (err) {
      updateActivity(activityId, {
        status: "failed",
        updatedAt: Date.now(),
      });
      const msg =
        err instanceof Error ? err.message : "Failed to anchor confession";
      setError(msg);
      setStatus("failed");
      setLiveMessage(msg);
    }
  };

  if (status === "confirmed" && txHash) {
    const explorerUrl = getStellarExplorerUrl(txHash);
    return (
      <div
        className={cn("stellar-anchor-action flex items-center gap-2", className)}
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="h-4 w-4 text-green-400" aria-hidden="true" />
        <span className="text-xs text-green-400">Anchored</span>
        <span className="font-mono text-xs text-zinc-500">{shortHash(txHash)}</span>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            aria-label="View transaction on Stellar explorer (opens in a new tab)"
          >
            View on explorer
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        <span className="sr-only">{liveMessage || "Confession anchored successfully."}</span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div
        className={cn("stellar-anchor-action flex items-center gap-2", className)}
        role="status"
        aria-live="polite"
      >
        <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
        <span className="text-xs text-red-400">{error || "Anchoring failed"}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnchor}
          className="flex items-center gap-1"
        >
          <RotateCcw className="h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  if (walletCTA.status === "not-installed") {
    return (
      <div
        className={cn("stellar-wallet-cta stellar-anchor-action flex flex-col gap-1.5", className)}
        role="region"
        aria-label="Wallet installation warning"
      >
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-yellow-500" aria-hidden="true" />
          <span className="text-xs text-yellow-400">{walletCTA.guidance}</span>
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div
        className={cn("stellar-anchor-action flex items-center gap-2", className)}
        role="status"
        aria-live="polite"
      >
        <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
        <span className="text-xs text-red-400">{error || "Anchoring failed"}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnchor}
          className="gap-1.5 rounded-full px-3 py-1 text-xs h-auto"
          aria-label="Retry anchoring confession"
        >
          <RotateCcw className="h-3 w-3" />
          Retry
        </Button>
        <span className="sr-only">{liveMessage}</span>
      </div>
    );
  }

  return (
    <div className={cn("stellar-anchor-action flex flex-col gap-1.5", className)}>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>

      {status === "failed" && error ? (
        <div
          className="flex flex-col gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" aria-hidden="true" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnchor}
            disabled={isPending || walletCTA.disabled}
            aria-busy={isPending}
            className="h-7 w-fit px-2 text-xs border-red-500/40 text-red-300 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
            Retry Anchoring
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnchor}
          disabled={isPending || walletCTA.disabled}
          aria-busy={isPending}
          className={cn(
            "h-7 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            walletCTA.status === "not-connected" &&
            "stellar-wallet-cta border-blue-500/40 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300",
          )}
        >
          {isPending || (isLoading && isConnected) ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
              Anchoring…
            </>
          ) : walletCTA.status === "not-connected" ? (
            <>
              <Wallet className="mr-1 h-3 w-3" aria-hidden="true" />
              Connect Wallet to Anchor
            </>
          ) : (
            <>
              <Anchor className="mr-1 h-3 w-3" aria-hidden="true" />
              Anchor
            </>
          )}
        </Button>
      )}

      {walletCTA.status === "not-connected" && walletCTA.guidance && (
        <p className="text-xs text-zinc-500">{walletCTA.guidance}</p>
      )}

      {walletCTA.status === "not-ready" && status !== "failed" && (
        <div className="text-xs text-orange-400" role="status" aria-live="polite">
          {walletCTA.guidance}
        </div>
      )}
    </div>
  );
};