'use client';

import { useWalletContext } from '@/lib/providers/WalletProvider';
import WalletButton from '@/components/wallet/WalletButton';
import Link from 'next/link';

/**
 * Application Header Component
 * Displays navigation, branding, wallet connection, and status indicator
 */
export const AppHeader: React.FC = () => {
  const wallet = useWalletContext();

  return (
    <header className="bg-gradient-to-r from-zinc-900 to-black border-b border-zinc-800 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo/Title */}
        <Link href="/" className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">X</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Xconfess</h1>
            <p className="text-xs text-gray-400">Anonymous Confessions</p>
          </div>
        </Link>

        {/* Navigation and Wallet */}
        <div className="flex items-center gap-6">
          {/* Status Indicator */}
          {wallet && (
            <div className="flex items-center gap-2 text-sm">
              {wallet.isConnected ? (
                <div className="flex items-center gap-2 text-green-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="hidden sm:inline">Connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-500"></span>
                  <span className="hidden sm:inline">Not Connected</span>
                </div>
              )}
            </div>
          )}

          {/* Wallet Button */}
          <WalletButton />
        </div>
      </div>
    </header>
  );
};

export default AppHeader;