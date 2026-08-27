/**
 * Shared network + signer readiness for tipping, anchoring, and wallet UI.
 */

export function computeWalletReadiness(params: {
  isConnected: boolean;
  publicKey: string | null;
  networkLabel: string;
}): { isReady: boolean; readinessError: string | null } {
  if (!params.isConnected) {
    return { isReady: false, readinessError: null };
  }

  const expected = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
  const actual = (params.networkLabel || "").toUpperCase();

  let isNetworkMatch = false;
  if (expected === "mainnet") {
    isNetworkMatch = ["PUBLIC", "PUBLIC_NETWORK", "MAINNET"].includes(actual);
  } else {
    isNetworkMatch = ["TESTNET", "TESTNET_SOROBAN"].includes(actual);
  }

  if (!isNetworkMatch) {
    const displayExpected = expected === "mainnet" ? "Mainnet" : "Testnet";
    return {
      isReady: false,
      readinessError: `Wallet on wrong network. Please switch to ${displayExpected}.`,
    };
  }

  if (!params.publicKey) {
    return {
      isReady: false,
      readinessError:
        "Wallet signer is unavailable. Unlock Freighter and try again.",
    };
  }

  return { isReady: true, readinessError: null };
}
