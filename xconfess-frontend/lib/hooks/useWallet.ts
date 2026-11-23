"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { computeWalletReadiness } from "../wallet/walletReadiness";
import { getActiveEmbeddedWallet, lockEmbeddedWallet } from "@/app/lib/crypto/embeddedWallet";

export interface WalletState {
  publicKey: string | null;
  network: "TESTNET_SOROBAN" | "PUBLIC_NETWORK" | string;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  isFreighterInstalled: boolean;
  isEmbeddedWallet: boolean;
}

export interface UseWalletReturn extends WalletState {
  isReady: boolean;
  readinessError: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string) => Promise<string>;
  checkConnection: () => Promise<void>;
  switchNetwork: (network: string) => void;
  clearError: () => void;
}

const WALLET_STORAGE_KEY = "xconfess_wallet_session";
const NETWORK_STORAGE_KEY = "xconfess_network";

/**
 * Custom hook for managing wallet connection and state
 * @returns Wallet state and methods
 */
export const useWallet = (): UseWalletReturn => {
  const [state, setState] = useState<WalletState>({
    publicKey: null,
    network: "TESTNET_SOROBAN",
    isConnected: false,
    isLoading: false,
    error: null,
    isFreighterInstalled: false,
    isEmbeddedWallet: false,
  });

  const hasInitialized = useRef(false);

  /**
   * Store session in localStorage
   */
  const storeSession = useCallback((publicKey: string, network: string) => {
    localStorage.setItem(
      WALLET_STORAGE_KEY,
      JSON.stringify({ publicKey, network }),
    );
    localStorage.setItem(NETWORK_STORAGE_KEY, network);
  }, []);

  /**
   * Clear session from localStorage
   */
  const clearSession = useCallback(() => {
    localStorage.removeItem(WALLET_STORAGE_KEY);
  }, []);

  /**
   * Get stored session from localStorage
   */
  const getStoredSession = useCallback((): {
    publicKey: string;
    network: string;
  } | null => {
    try {
      const stored = localStorage.getItem(WALLET_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Initialize wallet state from storage and current wallet connection
   */
  const initializeWallet = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const storedNetwork = localStorage.getItem(NETWORK_STORAGE_KEY);
      if (storedNetwork) {
        setState((prev) => ({ ...prev, network: storedNetwork }));
      }

      const embeddedWallet = getActiveEmbeddedWallet();

      if (embeddedWallet) {
        setState((prev) => ({ ...prev, publicKey: embeddedWallet.publicKey, network: embeddedWallet.network, isConnected: true, isEmbeddedWallet: true, isLoading: false, error: null }));
        storeSession(embeddedWallet.publicKey, embeddedWallet.network);
        return;
      }

      // Embedded XConfess Wallet is the only automatic identity. Never query Freighter on page load.
      setState((prev) => ({ ...prev, isLoading: false, error: null }));
      return;

    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to initialize wallet";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [storeSession, getStoredSession]);

  /**
   * Initialize wallet on mount
   */
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      initializeWallet();
    }
  }, [initializeWallet]);

  /**
   * Revalidate wallet connection on route changes
   */
  const pathname = usePathname();

  useEffect(() => {
    if (hasInitialized.current && state.publicKey) {
      const revalidateConnection = async () => {
        const embeddedWallet = getActiveEmbeddedWallet();

      if (embeddedWallet) {
        setState((prev) => ({ ...prev, publicKey: embeddedWallet.publicKey, network: embeddedWallet.network, isConnected: true, isEmbeddedWallet: true, isLoading: false, error: null }));
        storeSession(embeddedWallet.publicKey, embeddedWallet.network);
        return;
      }

      // External wallets are opt-in and must never trigger a popup during navigation.
      return;

      };
      revalidateConnection();
    }
  }, [pathname, state.publicKey, clearSession, storeSession]);

  /**
   * Connect to wallet
   */
  const connect = useCallback(async () => {
    const embeddedWallet = getActiveEmbeddedWallet();

    if (!embeddedWallet) {
      const message = "Create or import your XConfess Wallet to continue.";
      setState((prev) => ({ ...prev, isLoading: false, isConnected: false, error: message }));
      throw new Error("Use the XConfess Wallet signing flow.");
    }

    setState((prev) => ({ ...prev, publicKey: embeddedWallet.publicKey, network: embeddedWallet.network, isConnected: true, isEmbeddedWallet: true, isLoading: false, error: null }));
    storeSession(embeddedWallet.publicKey, embeddedWallet.network);
  }, [storeSession]);

  /**
   * Disconnect from wallet
   */
  const disconnect = useCallback(() => {
    setState((prev) => ({ ...prev, publicKey: null, isConnected: false, isEmbeddedWallet: false, error: null }));
    clearSession();
  }, [clearSession]);

  /**
   * Sign a transaction
   */
  const signTransaction = useCallback(async (_xdr: string): Promise<string> => {
    throw new Error("Use the XConfess Wallet signing flow.");
  }, []);

  /**
   * Check current wallet connection status
   */
  const checkConnection = useCallback(async () => {
    const embeddedWallet = getActiveEmbeddedWallet();

    if (embeddedWallet) {
      setState((prev) => ({ ...prev, publicKey: embeddedWallet.publicKey, network: embeddedWallet.network, isConnected: true, isEmbeddedWallet: true, isLoading: false, error: null }));
      storeSession(embeddedWallet.publicKey, embeddedWallet.network);
      return;
    }

    setState((prev) => ({ ...prev, publicKey: null, isConnected: false, isEmbeddedWallet: false, isLoading: false, error: null }));
  }, [storeSession]);

  /**
   * Switch network (local state only, actual network switch handled by wallet)
   */
  const switchNetwork = useCallback((network: string) => {
    setState((prev) => ({
      ...prev,
      network,
    }));
    localStorage.setItem(NETWORK_STORAGE_KEY, network);
  }, []);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  const { isReady, readinessError } = computeWalletReadiness({
    isConnected: state.isConnected,
    publicKey: state.publicKey,
    networkLabel: state.network,
  });

  return {
    ...state,
    isReady,
    readinessError,
    connect,
    disconnect,
    signTransaction,
    checkConnection,
    switchNetwork,
    clearError,
  };
};