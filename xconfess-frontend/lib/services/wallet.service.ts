/**
 * Wallet service — delegates to the canonical Freighter adapter.
 */

import { Networks } from "@stellar/stellar-sdk";
import {
  freighterConnect,
  freighterDisconnect,
  freighterGetNetworkLabel,
  freighterGetPublicKey,
  freighterGetWalletInfo,
  freighterSignTransaction,
  isFreighterInstalled,
  normalizeFreighterError,
} from "@/lib/wallet/freighterAdapter";

interface WalletConnectResponse {
  publicKey: string;
  network: string;
}

function expectedNetworkPassphrase(): string {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
  return network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
}

function wrap(message: string, error: unknown): Error {
  const inner = error instanceof Error ? error.message : String(error);
  return new Error(`${message}: ${inner}`);
}

export { isFreighterInstalled };

export const connectWallet = async (): Promise<WalletConnectResponse> => {
  try {
    return await freighterConnect();
  } catch (error) {
    throw wrap("Wallet connection failed", error);
  }
};

export const disconnectWallet = async (): Promise<void> => {
  await freighterDisconnect();
};

export const getPublicKey = async (): Promise<string> => {
  try {
    return await freighterGetPublicKey();
  } catch (error) {
    throw wrap("Failed to get public key", error);
  }
};

export const signTransaction = async (
  transactionXDR: string,
): Promise<string> => {
  try {
    return await freighterSignTransaction(
      transactionXDR,
      expectedNetworkPassphrase(),
    );
  } catch (error) {
    const e = normalizeFreighterError(error);
    throw new Error(`Transaction signing failed: ${e.message}`);
  }
};

export const getNetwork = async (): Promise<string> => {
  try {
    return await freighterGetNetworkLabel();
  } catch (error) {
    console.error("Failed to get network:", error);
    return "TESTNET_SOROBAN";
  }
};

export const isWalletConnected = async (): Promise<boolean> => {
  try {
    if (!isFreighterInstalled()) return false;
    await freighterGetPublicKey();
    return true;
  } catch {
    return false;
  }
};

export const getWalletInfo = async (): Promise<WalletConnectResponse | null> => {
  return freighterGetWalletInfo();
};

export const isOnCorrectNetwork = async (
  requiredNetwork: string,
): Promise<boolean> => {
  try {
    const currentNetwork = await getNetwork();
    return currentNetwork === requiredNetwork;
  } catch {
    return false;
  }
};
