/**
 * Tipping Service
 * Handles XLM tipping functionality for confessions
 */

import {
  Networks,
  Horizon,
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { ActivityStatus } from "@/app/lib/types/activity";
import {
  isFreighterInstalled,
  freighterGetPublicKey,
  freighterSignTransaction,
} from "../wallet/freighterAdapter";

const MIN_TIP_AMOUNT = 0.1;

// -------------------- Types --------------------

export type NetworkKind = "testnet" | "mainnet" | "unknown";
export type TipStatus = "pending" | "confirmed" | "failed" | "stale_pending";

export interface TipStats {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
}

export interface VerifyTipParams {
  confessionId: string;
  signedXdr: string;
}

export interface TipVerificationResult {
  tipId: string;
  status: TipStatus;
  confirmedAt?: string;
  failureReason?: string;
}

export interface Tip {
  id: string;
  confessionId: string;
  amount: number;
  txId: string;
  senderAddress: string | null;
  createdAt: string;
}

export interface VerifyTipResult {
  success: boolean;
  status: TipStatus;
  error?: string;
  tip?: Tip;
  isIdempotent?: boolean;
  canRetry?: boolean;
}

// -------------------- Helpers --------------------

function getStellarNetwork(): string {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
  return network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
}

function getStellarServer(): Horizon.Server {
  const horizonUrl =
    process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ||
    "https://horizon-testnet.stellar.org";
  return new Horizon.Server(horizonUrl);
}

function classifyTipError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("reject") || normalized.includes("declin") || normalized.includes("denied") || normalized.includes("cancel")) {
    return "Transaction was rejected in your wallet.";
  }

  if (normalized.includes("timeout")) return "Wallet request timed out.";
  if (normalized.includes("network mismatch")) return message;
  if (normalized.includes("insufficient")) return "Insufficient XLM balance.";

  return message || "Failed to send tip";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTipStatus(payload: any): TipStatus {
  const rawStatus = String(
    payload?.status ??
      payload?.verificationStatus ??
      payload?.tip?.verificationStatus ??
      "",
  ).toLowerCase();

  if (["verified", "confirmed", "completed", "success"].includes(rawStatus)) {
    return "confirmed";
  }

  if (["rejected", "failed", "conflict"].includes(rawStatus)) {
    return "failed";
  }

  if (rawStatus === "stale_pending") {
    return "stale_pending";
  }

  if (rawStatus === "pending" || rawStatus === "submitted") {
    return "pending";
  }

  return payload?.tip || payload?.txId || payload?.id ? "confirmed" : "pending";
}

function normalizeTipStats(payload: any): TipStats {
  const totalAmount = Number(payload?.totalAmount ?? 0);
  const totalCount = Number(payload?.totalCount ?? payload?.tipCount ?? 0);
  const averageAmount = Number(
    payload?.averageAmount ??
      (totalCount > 0 ? totalAmount / totalCount : 0),
  );

  return {
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    totalCount: Number.isFinite(totalCount) ? totalCount : 0,
    averageAmount: Number.isFinite(averageAmount) ? averageAmount : 0,
  };
}

function extractTipError(payload: any, fallback: string): string {
  if (typeof payload === "string") return payload;
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.error === "string") return payload.error;
  if (typeof payload?.error?.message === "string") return payload.error.message;
  return fallback;
}

function isReplaySuccess(status: number, payload: any): boolean {
  if (status !== 409) return false;
  if (payload?.canRetry || payload?.conflictReason === "ALREADY_PROCESSING") {
    return false;
  }

  const message = extractTipError(payload, "").toLowerCase();
  return (
    payload?.isIdempotent === true ||
    payload?.conflictReason === "ALREADY_VERIFIED" ||
    message.includes("duplicate") ||
    message.includes("idempotent") ||
    message.includes("replay") ||
    (message.includes("already") &&
      (message.includes("verified") ||
        message.includes("processed") ||
        message.includes("recorded")))
  );
}

function isTransientVerifyStatus(status: number): boolean {
  return [408, 429, 502, 503, 504].includes(status);
}

// -------------------- Fake Checker --------------------

/**
 * Fake status checker — replace with actual backend or Stellar SDK call
 */
export const checkTransactionStatus = async (): Promise<ActivityStatus> => {
  await sleep(2000);

  const random = Math.random();
  if (random > 0.7) return "confirmed";
  if (random > 0.4) return "failed";
  return "submitted";
};

// -------------------- Wallet Helpers --------------------

export async function isFreighterAvailable(): Promise<boolean> {
  return isFreighterInstalled();
}

// -------------------- Send Tip --------------------

export async function sendTip(
  confessionId: string,
  amount: number,
  recipientAddress: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    if (amount < MIN_TIP_AMOUNT) {
      return { success: false, error: `Minimum tip amount is ${MIN_TIP_AMOUNT} XLM` };
    }

    if (!isFreighterInstalled()) {
      return { success: false, error: "Freighter wallet not found" };
    }

    let publicKey: string;
    try {
      publicKey = await freighterGetPublicKey();
    } catch {
      return { success: false, error: "Freighter wallet not found" };
    }

    const network = getStellarNetwork();
    const server = getStellarServer();

    const senderAccount = await server.loadAccount(publicKey);

    // Validate recipient
    try { Keypair.fromPublicKey(recipientAddress); } catch {
      return { success: false, error: "Invalid recipient address" };
    }

    const transaction = new TransactionBuilder(senderAccount, { fee: BASE_FEE, networkPassphrase: network })
      .addOperation(Operation.payment({ destination: recipientAddress, asset: Asset.native(), amount: amount.toString() }))
      .setTimeout(30)
      .build();

    const signedXDR = await freighterSignTransaction(transaction.toXDR(), network);
    const tx = TransactionBuilder.fromXDR(signedXDR, network);
    const result = await server.submitTransaction(tx);

    if (!result.hash) return { success: false, error: "No transaction hash returned" };

    return { success: true, txHash: result.hash };
  } catch (error) {
    console.error(error);
    return { success: false, error: classifyTipError(error) };
  }
}

// -------------------- Verify Tip --------------------

export async function verifyTip(
  confessionId: string,
  txHash: string
): Promise<VerifyTipResult> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`/api/confessions/${confessionId}/tips/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId: txHash }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const status = normalizeTipStatus(data);
        return {
          success: status === "confirmed",
          status,
          tip: data?.tip ?? data,
          isIdempotent: Boolean(data?.isIdempotent),
          error: status === "confirmed" ? undefined : "Backend verification is still pending.",
        };
      }

      if (isReplaySuccess(res.status, data)) {
        return {
          success: true,
          status: "confirmed",
          isIdempotent: true,
          tip: data?.tip,
        };
      }

      if (res.status === 409 && (data?.canRetry || data?.conflictReason === "ALREADY_PROCESSING")) {
        return {
          success: false,
          status: "pending",
          error: extractTipError(data, "Transaction is still being processed. Retry verification in a moment."),
          canRetry: true,
        };
      }

      if (isTransientVerifyStatus(res.status) && attempt < maxAttempts) {
        await sleep(100);
        continue;
      }

      return {
        success: false,
        status: normalizeTipStatus(data),
        error: extractTipError(data, "Verification failed"),
        canRetry: data?.canRetry,
      };
    } catch (err: any) {
      if (attempt < maxAttempts) {
        await sleep(100);
        continue;
      }

      return {
        success: false,
        status: "failed",
        error: err.message,
      };
    }
  }

  return {
    success: false,
    status: "failed",
    error: "Verification failed",
  };
}

// -------------------- Get Tip Stats --------------------

export async function getTipStats(confessionId: string): Promise<TipStats | null> {
  try {
    const res = await fetch(`/api/confessions/${confessionId}/tips/stats`);
    if (!res.ok) return null;
    return normalizeTipStats(await res.json());
  } catch {
    return null;
  }
}

// -------------------- Backend Integration --------------------

export async function verifySignedTip(
  params: VerifyTipParams,
): Promise<TipVerificationResult> {
  const response = await fetch("/api/tips/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body?.message ?? `Tip verification failed (${response.status})`,
    );
  }

  return response.json() as Promise<TipVerificationResult>;
}

export async function fetchTipStatus(
  tipId: string,
): Promise<TipVerificationResult> {
  const response = await fetch(`/api/tips/${tipId}/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tip status (${response.status})`);
  }
  return response.json() as Promise<TipVerificationResult>;
}
