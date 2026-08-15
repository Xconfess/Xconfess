'use client';

import { useWalletContext } from '@/lib/providers/WalletProvider';
import WalletButton from '@/components/wallet/WalletButton';
import { BrandLogo } from '@/app/components/brand/BrandLogo';

/**
 * Application Header Component
 * Displays navigation, branding, wallet connection, and status indicator
 */
export const AppHeader: React.FC = () => {
  const wallet = useWalletContext();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--brand-ink)] shadow-[0_18px_60px_-42px_rgba(11,27,51,0.7)]">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <BrandLogo tone="light" imageClassName="w-[154px]" />

        {/* Navigation and Wallet */}
        <div className="flex items-center gap-6">
          {/* Status Indicator */}
          {wallet && (
            <div className="flex items-center gap-2 text-sm">
              {wallet.isConnected ? (
                <div className="flex items-center gap-2 text-emerald-300">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  <span className="hidden sm:inline">Connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-300">
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
