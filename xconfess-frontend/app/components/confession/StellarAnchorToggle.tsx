"use client";

import { useState, useEffect } from "react";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { freighterGetPublicKey } from "@/lib/wallet/freighterAdapter";
import { getStellarExplorerUrl } from "@/app/lib/utils/stellar";
import { Button } from "@/app/components/ui/button";
import { ExternalLink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

interface StellarAnchorToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  transactionHash?: string | null;
  className?: string;
}

export const StellarAnchorToggle: React.FC<StellarAnchorToggleProps> = ({
  enabled,
  onToggle,
  transactionHash,
  className,
}) => {
  const { isAvailable, isConnected, publicKey, isLoading, error, connect } =
    useStellarWallet();
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (isAvailable && !isConnected && !isLoading && !error) {
      // Don't auto-connect, let user decide
    }
  }, [isAvailable, isConnected, isLoading, error]);

  const handleToggle = async (checked: boolean) => {
    if (checked && !isConnected) {
      setIsConnecting(true);
      try {
        await connect();
        const connected = await freighterGetPublicKey().catch(() => null);
        if (connected) {
          onToggle(true);
        }
      } catch (err) {
        console.error("Failed to connect wallet:", err);
      } finally {
        setIsConnecting(false);
      }
    } else {
      onToggle(checked);
    }
  };

  const explorerUrl = getStellarExplorerUrl(transactionHash);

  return (
    <div className={cn("space-y-2", className)}>
      <label className="flex items-center gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={!isAvailable || isConnecting || isLoading}
          className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Anchor confession on Stellar blockchain"
        />
        <span className="text-sm font-medium text-zinc-300">
          Anchor on Stellar
        </span>
        {isLoading || isConnecting ? (
          <Loader2 role='status' aria-label='loading' className="h-4 w-4 animate-spin text-zinc-400" />
        ) : enabled && transactionHash ? (
          <CheckCircle2 className="h-4 w-4 text-green-400" />
        ) : null}
      </label>

      {!isAvailable && (
        <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Freighter wallet not found</p>
            <p className="text-yellow-300/80 mt-1">
              Install{" "}
              <a
                href="https://freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-yellow-300"
              >
                Freighter extension
              </a>{" "}
              to anchor confessions on Stellar.
            </p>
          </div>
        </div>
      )}

      {isAvailable && !isConnected && enabled && (
        <div className="flex items-start gap-2 text-xs text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-lg p-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Wallet not connected</p>
            <Button
              variant="outline"
              size="sm"
              onClick={connect}
              disabled={isConnecting || isLoading}
              className="mt-2"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect Wallet"
              )}
            </Button>
          </div>
        </div>
      )}

      {isConnected && publicKey && (
        <p className="text-xs text-zinc-500">
          Connected: {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {transactionHash && (
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <span className="text-zinc-400">Anchored on Stellar</span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 underline"
            >
              View transaction
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};
