"use client";

import { useState, type FC } from "react";
import { Anchor, CheckCircle2, ExternalLink, Loader2, AlertCircle, Wallet, RotateCcw } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils/cn";
import { focusVisible } from "@/app/lib/utils/focusStyles";
import { useActivityStore } from "@/app/lib/store/activity.store";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { getWalletCTAState } from "@/lib/hooks/useWalletCTAState";
import { getStellarExplorerUrl, mapAnchorApiError } from "@/app/lib/utils/stellar";

type AnchorStatus = "idle" | "pending" | "submitted" | "confirmed" | "failed";

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
    isEmbeddedWallet,
    isConnected,
    isReady,
    readinessError,
    connect,
    anchor,
    isLoading,
    network,
  } = useStellarWallet();
  const walletCTA = getWalletCTAState({
    isFreighterInstalled: isAvailable,
    isEmbeddedWallet,
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
  const [walletPin, setWalletPin] = useState("");

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
      const result = await anchor(confessionContent, walletPin);

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
        setStatus("submitted");
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
        <CheckCircle2 className="h-4 w-4 text-[var(--success)]" aria-hidden="true" />
        <span className="text-xs font-medium text-[var(--success)]">Anchored</span>
        <span className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--secondary)]">
          {network === "PUBLIC_NETWORK" ? "Mainnet" : "Testnet"}
        </span>
        <span className="font-mono text-xs text-[var(--text-muted)]">{shortHash(txHash)}</span>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs rounded text-[var(--primary-deep)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
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

  if (status === "submitted" && txHash) {
    const explorerUrl = getStellarExplorerUrl(txHash);
    return (
      <div
        className={cn("stellar-anchor-action flex flex-wrap items-center gap-2", className)}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin text-[var(--warning)]" aria-hidden="true" />
        <span className="text-xs font-medium text-[var(--warning)]">Anchor pending</span>
        <span className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--secondary)]">
          {network === "PUBLIC_NETWORK" ? "Mainnet" : "Testnet"}
        </span>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("flex items-center gap-1 text-xs text-[var(--primary-deep)] hover:underline", focusVisible)}
          >
            Check transaction
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        <span className="sr-only">{liveMessage || "Anchor transaction is pending."}</span>
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
        <AlertCircle className="h-4 w-4 text-[var(--danger)]" aria-hidden="true" />
        <span className="text-xs font-medium text-[var(--warning)]">Anchor unavailable</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnchor}
          className="flex items-center gap-1"
          title={error || "Retry Stellar anchoring"}
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
        <div className="flex items-center gap-2 rounded-md border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-2.5 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-[var(--warning)]" aria-hidden="true" />
          <span className="text-xs text-[var(--warning)]">{walletCTA.guidance}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("stellar-anchor-action flex flex-col gap-1.5", className)}>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>
      {isEmbeddedWallet && (
        <label htmlFor="anchor-wallet-pin" className="block text-xs text-[var(--secondary)]">
          Wallet PIN
          <input id="anchor-wallet-pin" type="password" inputMode="numeric" value={walletPin} onChange={(event) => setWalletPin(event.target.value)} placeholder="Required to sign locally" className={cn("mt-1 h-9 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm text-[var(--foreground)]", focusVisible)} />
        </label>
      )}
      <Button
          variant="outline"
          size="sm"
          onClick={handleAnchor}
          disabled={isPending || walletCTA.disabled}
          aria-busy={isPending}
          title="Anchor this confession on Stellar"
          className={cn(
            "h-7 px-2 text-xs focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
            walletCTA.status === "not-connected" &&
            "stellar-wallet-cta border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
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
              Anchor on Stellar
            </>
          )}
      </Button>

      <span className="text-[11px] text-[var(--text-muted)]">
        Not anchored · {network === "PUBLIC_NETWORK" ? "Mainnet" : "Testnet"}
      </span>

      {walletCTA.status === "not-connected" && walletCTA.guidance && (
        <p className="text-xs text-[var(--text-muted)]">{walletCTA.guidance}</p>
      )}

      {walletCTA.status === "not-ready" && (
        <div className="text-xs text-[var(--warning)]" role="status" aria-live="polite">
          {walletCTA.guidance}
        </div>
      )}
    </div>
  );
};
