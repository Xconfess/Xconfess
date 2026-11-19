"use client";

import { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Copy, Loader2 } from "lucide-react";
import { WalletContext } from "@/lib/providers/WalletProvider";

interface WalletButtonProps {
  className?: string;
}

/**
 * Truncate public key for display
 */
const truncateAddress = (address: string, chars = 6): string => {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

/**
 * Get network display name and color
 */
const getNetworkInfo = (
  network: string,
): { name: string; color: string; bgColor: string } => {
  switch (network.toUpperCase()) {
    case "TESTNET_SOROBAN":
    case "TESTNET":
      return {
        name: "Testnet",
        color: "#FF6B6B",
        bgColor: "rgba(255, 107, 107, 0.1)",
      };
    case "PUBLIC_NETWORK":
    case "MAINNET":
    case "PUBLIC":
      return {
        name: "Mainnet",
        color: "#51CF66",
        bgColor: "rgba(81, 207, 102, 0.1)",
      };
    default:
      return {
        name: network,
        color: "#748FFC",
        bgColor: "rgba(116, 143, 252, 0.1)",
      };
  }
};

/**
 * Wallet Button Component
 * Displays wallet connection status and wallet-first identity actions
 */
export const WalletButton: React.FC<WalletButtonProps> = ({
  className = "",
}) => {
  const wallet = useContext(WalletContext);
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  if (!wallet) {
    return null;
  }

  const {
    publicKey,
    network,
    isConnected,
    isLoading,
    error,
    isReady,
    readinessError,
    disconnect,
  } = wallet;
  const networkInfo = getNetworkInfo(network);
  const handleWalletAction = () => {
    router.push("/wallet");
  };

  const handleLockWallet = () => {
    disconnect();
    setIsDropdownOpen(false);
  };

  const copyToClipboard = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey);
      // Optional: Show toast notification
      console.log("Public key copied to clipboard");
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <button
        disabled
        className={`flex h-9 max-w-[42vw] items-center gap-2 truncate rounded-[var(--radius-control)] border border-[var(--border)] px-3 text-sm text-[var(--secondary)] ${className}`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Connecting…
      </button>
    );
  }

  // Error state
  if (error && !isConnected) {
    return (
      <div className={`relative group ${className}`}>
        <button
          onClick={handleWalletAction}
          className="flex h-9 max-w-[42vw] items-center gap-2 truncate rounded-[var(--radius-control)] border border-[var(--danger)]/40 px-3 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
          title={error}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Connect wallet
        </button>
        <div className="absolute right-0 top-full z-50 mt-2 hidden whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs text-[var(--foreground)] shadow-[var(--shadow-popover)] group-hover:block">
          {error}
        </div>
      </div>
    );
  }

  // Connected but not ready state (e.g. wrong network or no signer)
  if (isConnected && !isReady) {
    return (
      <div className={`relative group ${className}`}>
        <button
          onClick={handleLockWallet}
          className="flex h-9 max-w-[42vw] items-center gap-2 truncate rounded-[var(--radius-control)] border border-[var(--warning)]/40 px-3 text-sm font-medium text-[var(--warning)] transition-colors hover:bg-[var(--warning)]/10"
          title={readinessError || "Open wallet"}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {readinessError?.includes("network")
            ? "Network Mismatch"
            : "Action Required"}
        </button>
        <div className="absolute right-0 top-full z-50 mt-2 hidden whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs text-[var(--foreground)] shadow-[var(--shadow-popover)] group-hover:block">
          {readinessError} (Open wallet to review)
        </div>
      </div>
    );
  }

  // Connected state
  if (isConnected && publicKey) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          aria-haspopup="menu"
          aria-expanded={isDropdownOpen}
          aria-label="Wallet menu"
          className="flex h-9 max-w-[42vw] items-center gap-2 truncate rounded-[var(--radius-control)] border border-[var(--border)] px-3 font-mono text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--surface-muted)]"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden="true"></span>
          <span className="truncate">{truncateAddress(publicKey, 4)}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-[var(--secondary)] transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div
            role="menu"
            aria-label="Wallet actions"
            className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-popover)]"
          >
            {/* Network Info */}
            <div className="p-4 border-b border-[var(--border)]">
              <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                Network
              </div>
              <div
                className="px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
                style={{
                  backgroundColor: networkInfo.bgColor,
                  color: networkInfo.color,
                }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: networkInfo.color }}
                ></span>
                {networkInfo.name}
              </div>
            </div>

            {/* Public Key Section */}
            <div className="p-4 border-b border-[var(--border)]">
              <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                Public key
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-2 font-mono text-xs text-[var(--foreground)]">
                  {publicKey}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="rounded-[var(--radius-control)] p-2 text-[var(--secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                  title="Copy to clipboard"
                  aria-label="Copy public key"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Lock wallet Button */}
            <div className="p-3">
              <button
                onClick={handleLockWallet}
                className="w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
              >
                Lock wallet
              </button>
            </div>
          </div>
        )}

        {/* Close dropdown when clicking outside */}
        {isDropdownOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsDropdownOpen(false)}
          />
        )}
      </div>
    );
  }

  // Not connected state
  return (
    <button
      onClick={handleWalletAction}
      className={`flex h-9 max-w-[42vw] items-center truncate rounded-[var(--radius-control)] bg-[var(--primary)] px-3 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)] ${className}`}
    >
      Connect wallet
    </button>
  );
};

export default WalletButton;
