'use client';

import React, { createContext, useEffect, useState, ReactNode } from 'react';
import { useWallet, UseWalletReturn } from '@/lib/hooks/useWallet';

export const WalletContext = createContext<UseWalletReturn | null>(null);

interface WalletProviderProps {
  children: ReactNode;
}

/**
 * Wallet Provider Component
 * Manages global wallet state and persists connection across page refreshes
 */
export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const wallet = useWallet();
  const [isHydrated, setIsHydrated] = useState(false);

  /**
   * Hydrate wallet state on client-side
   * This ensures localStorage is properly synced
   */
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Prevent rendering until hydration is complete
  if (!isHydrated) {
    return null;
  }

  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
};

/**
 * Custom hook to use wallet context
 * Must be used within WalletProvider
 */
export const useWalletContext = (): UseWalletReturn => {
  const context = React.useContext(WalletContext);

  if (!context) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }

  return context;
};
