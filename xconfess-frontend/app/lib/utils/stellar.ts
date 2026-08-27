import * as StellarSDK from "@stellar/stellar-sdk";
import CryptoJS from "crypto-js";
import {
  freighterGetPublicKey,
  freighterSignTransaction,
  isFreighterInstalled,
} from "@/lib/wallet/freighterAdapter";

const STEEXP_BASE = "https://testnet.steexp.com";
const STELLAR_EXPERT_BASE = "https://stellar.expert/explorer";

export function getStellarExplorerUrl(
  txHash: string | null | undefined,
): string | null {
  if (!txHash) return null;
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
  if (network === "mainnet") {
    return `${STELLAR_EXPERT_BASE}/public/tx/${txHash}`;
  }
  // Testnet: use steexp.com per Wave 5 AC
  return `${STEEXP_BASE}/tx/${txHash}`;
}

export function mapAnchorApiError(status: number, message?: string): string {
  const lower = message?.toLowerCase() ?? "";
  if (lower.includes("already anchored")) return "This confession is already anchored.";
  if (lower.includes("invalid") && lower.includes("hash")) return "Invalid transaction hash. Try anchoring again.";
  if (lower.includes("not found")) return "Confession not found.";
  switch (status) {
    case 400: return message || "Invalid anchor request.";
    case 401: return "Sign in to save your anchor.";
    case 403: return "You cannot anchor this confession.";
    case 404: return "Confession not found.";
    case 409: return "This confession is already anchored.";
    case 503: return "Server unavailable. Check your wallet — the on-chain anchor may have succeeded.";
    default: return message || "Failed to save anchor. Try again.";
  }
}

export function hashConfession(content: string, timestamp?: number): string {
  const ts = timestamp || Date.now();
  const payload = JSON.stringify({ content, timestamp: ts });
  return CryptoJS.SHA256(payload).toString(CryptoJS.enc.Hex);
}

export function getStellarNetwork(): StellarSDK.Networks {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
  return network === "mainnet" ? StellarSDK.Networks.PUBLIC : StellarSDK.Networks.TESTNET;
}

export function getStellarServer(): StellarSDK.Horizon.Server {
  const horizonUrl =
    process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ||
    "https://horizon-testnet.stellar.org";
  return new StellarSDK.Horizon.Server(horizonUrl);
}

export async function isFreighterAvailable(): Promise<boolean> {
  return isFreighterInstalled();
}

export async function getPublicKey(): Promise<string | null> {
  try {
    return await freighterGetPublicKey();
  } catch {
    return null;
  }
}

export async function anchorConfession(
  confessionHash: string,
  timestamp: number,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const contractId = process.env.NEXT_PUBLIC_STELLAR_CONTRACT_ID;
    if (!contractId) return { success: false, error: "Stellar contract ID not configured" };
    if (!isFreighterInstalled()) return { success: false, error: "Freighter wallet not found" };

    let publicKey: string;
    try {
      publicKey = await freighterGetPublicKey();
    } catch {
      return { success: false, error: "Failed to get public key from wallet" };
    }

    const network = getStellarNetwork();
    const horizonServer = getStellarServer();
    const sorobanRpcUrl =
      process.env.NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL ||
      (network === StellarSDK.Networks.PUBLIC
        ? "https://soroban-rpc.mainnet.stellar.org"
        : "https://soroban-rpc-testnet.stellar.org");
    const sorobanServer = new StellarSDK.rpc.Server(sorobanRpcUrl);
    const account = await horizonServer.loadAccount(publicKey);
    const contract = new StellarSDK.Contract(contractId);

    const hexToUint8Array = (hex: string): Uint8Array => {
      const matches = hex.match(/.{1,2}/g);
      if (!matches) throw new Error("Invalid hex string");
      return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
    };

    const hashArray = hexToUint8Array(confessionHash);
    if (hashArray.length !== 32) throw new Error("Invalid hash length");

    // @ts-expect-error - Next.js fetch extension
    const hashBytes = StellarSDK.xdr.ScVal.scvBytes(hashArray);
    const timestampVal = StellarSDK.xdr.ScVal.scvU64(
      StellarSDK.xdr.Uint64.fromString(timestamp.toString()),
    );

    const transaction = new StellarSDK.TransactionBuilder(account, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: network,
    })
      .addOperation(contract.call("anchor_confession", hashBytes, timestampVal))
      .setTimeout(30)
      .build();

    const preparedTx = await sorobanServer.prepareTransaction(transaction);
    const signedTx = await freighterSignTransaction(preparedTx.toXDR(), network);
    const submitResponse = await sorobanServer.sendTransaction(
      StellarSDK.TransactionBuilder.fromXDR(signedTx, network),
    );

    const status = submitResponse.status as string;
    const responseAny = submitResponse as any;

    if (status === "ERROR") throw new Error(`Transaction submission error: ${responseAny.errorResultXdr || "Unknown error"}`);
    if (status === "DUPLICATE") throw new Error(`Duplicate transaction: ${responseAny.errorResultXdr || "Already submitted"}`);
    if (status === "TRY_AGAIN_LATER") {
      await new Promise((r) => setTimeout(r, 2000));
      throw new Error("Transaction submission temporarily unavailable, please try again");
    }
    if (!submitResponse.hash) throw new Error("Transaction submitted but no hash returned");

    let txResponse;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const result = await sorobanServer.getTransaction(submitResponse.hash);
      if (result.status === StellarSDK.rpc.Api.GetTransactionStatus.SUCCESS) { txResponse = result; break; }
      else if (result.status === StellarSDK.rpc.Api.GetTransactionStatus.FAILED) throw new Error(`Transaction failed: ${result.resultXdr}`);
    }
    if (!txResponse) throw new Error("Transaction timeout - could not confirm transaction");

    return { success: true, txHash: submitResponse.hash };
  } catch (error: any) {
    console.error("Failed to anchor confession:", error);
    return { success: false, error: error.message || "Failed to anchor confession on Stellar" };
  }
}
