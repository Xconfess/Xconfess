"use client";

import { useContext, useState } from "react";
import { WalletContext } from "@/lib/providers/WalletProvider";

interface WalletButtonProps {
  className?: string;
}

const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";

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
 * Displays wallet connection status and allows connect/disconnect
 */
export const WalletButton: React.FC<WalletButtonProps> = ({
  className = "",
}) => {
  const wallet = useContext(WalletContext);
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
    connect,
    disconnect,
  } = wallet;
  const networkInfo = getNetworkInfo(network);
  const shouldInstallWallet =
    !wallet.isFreighterInstalled ||
    error?.toLowerCase().includes("not installed");

  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      console.error("Failed to connect wallet:", err);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setIsDropdownOpen(false);
  };

  const handleInstallWallet = () => {
    window.open(FREIGHTER_INSTALL_URL, "_blank", "noopener,noreferrer");
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
        className={`px-4 py-2 rounded-lg bg-gray-200 text-gray-600 cursor-not-allowed opacity-60 ${className}`}
      >
        <span className="inline-block animate-spin mr-2">⏳</span>
        Connecting...
      </button>
    );
  }

  // Error state
  if (error && !isConnected) {
    return (
      <div className={`relative group ${className}`}>
        <button
          onClick={shouldInstallWallet ? handleInstallWallet : handleConnect}
          className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition font-medium text-sm border border-red-300"
          title={error}
        >
          ⚠️{" "}
          {shouldInstallWallet
            ? "Install Wallet"
            : "Connect Wallet"}
        </button>
        <div className="absolute hidden group-hover:block bg-red-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-50 bottom-full mb-2">
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
          onClick={handleDisconnect}
          className="px-4 py-2 rounded-lg bg-orange-100 text-orange-800 hover:bg-orange-200 transition font-medium text-sm border border-orange-300 flex items-center gap-2"
          title={readinessError || "Action Required"}
        >
          ⚠️{" "}
          {readinessError?.includes("network")
            ? "Network Mismatch"
            : "Action Required"}
        </button>
        <div className="absolute hidden group-hover:block bg-orange-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-50 bottom-full mb-2">
          {readinessError} (Click to disconnect)
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
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-lg transition font-medium text-sm flex items-center gap-2 whitespace-nowrap"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          {truncateAddress(publicKey)}
          <svg
            className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div
            role="menu"
            aria-label="Wallet actions"
            className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl z-50 overflow-hidden border border-gray-200"
          >
            {/* Network Info */}
            <div className="p-4 border-b border-gray-200">
              <div className="text-xs text-gray-500 font-semibold mb-2">
                NETWORK
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
            <div className="p-4 border-b border-gray-200">
              <div className="text-xs text-gray-500 font-semibold mb-2">
                PUBLIC KEY
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-100 p-2 rounded font-mono text-gray-700 break-all">
                  {publicKey}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-gray-200 rounded transition text-gray-600"
                  title="Copy to clipboard"
                >
                  📋
                </button>
              </div>
            </div>

            {/* Disconnect Button */}
            <div className="p-3">
              <button
                onClick={handleDisconnect}
                className="w-full px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition font-medium text-sm border border-red-200"
              >
                Disconnect
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
      onClick={handleConnect}
      className={`px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium text-sm ${className}`}
    >
      Connect Wallet
    </button>
  );
};

export default WalletButton;
