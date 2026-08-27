"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/lib/hooks/useWallet";
import { anchorConfession, hashConfession } from "@/app/lib/utils/stellar";
import { handleStellarError } from "@/lib/stellarErrorHandler";

export interface StellarWalletState {
  isAvailable: boolean;
  isConnected: boolean;
  publicKey: string | null;
  network: string;
  isLoading: boolean;
  error: string | null;
  isReady: boolean;
  readinessError: string | null;
}

/**
 * Stellar anchoring + wallet UX built on the canonical `useWallet` hook
 * so tipping and anchoring share connection, network, and readiness rules.
 */
export function useStellarWallet() {
  const wallet = useWallet();
  const [anchorError, setAnchorError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setAnchorError(null);
    await wallet.connect();
  }, [wallet]);

  const anchor = useCallback(
    async (
      content: string,
    ): Promise<{ success: boolean; txHash?: string; error?: string }> => {
      if (!wallet.isConnected || !wallet.publicKey) {
        const err = "Wallet not connected";
        setAnchorError(err);
        return { success: false, error: err };
      }

      if (!wallet.isReady) {
        const err = wallet.readinessError || "Wallet not ready";
        setAnchorError(err);
        return { success: false, error: err };
      }

      setAnchorError(null);
      wallet.clearError();
      try {
        const timestamp = Date.now();
        const hash = hashConfession(content, timestamp);
        const result = await anchorConfession(hash, timestamp);

        if (result.error) {
          const stellarError = handleStellarError(result.error);
          const userError = stellarError.actionable || stellarError.message;
          setAnchorError(userError);
          return { success: false, error: userError };
        }

        setAnchorError(null);
        return result;
      } catch (error: unknown) {
        const stellarError = handleStellarError(error);
        const userError = stellarError.actionable || stellarError.message;
        setAnchorError(userError);
        return { success: false, error: userError };
      }
    },
    [wallet],
  );

  const combinedError = wallet.error || anchorError;

  return {
    isAvailable: wallet.isFreighterInstalled,
    isConnected: wallet.isConnected,
    publicKey: wallet.publicKey,
    network: wallet.network,
    isLoading: wallet.isLoading,
    error: combinedError,
    isReady: wallet.isReady,
    readinessError: wallet.readinessError,
    connect,
    anchor,
  };
}
