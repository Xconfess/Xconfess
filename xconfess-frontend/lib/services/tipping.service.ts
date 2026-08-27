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
const MAX_TIP_AMOUNT = 10_000;
const TIP_PRECISION = 7;

// -------------------- Types --------------------

export type NetworkKind = "testnet" | "mainnet" | "unknown";
export type TipStatus = "pending" | "confirmed" | "failed" | "stale_pending";

/**
 * Typed verify-response state from the backend (issue #1687).
 * `verified` and `duplicate` are success outcomes; the rest are typed
 * errors the UI should message distinctly rather than lumping into one
 * generic failure.
 */
export type TipVerifyState =
  | "verified"
  | "duplicate"
  | "pending"
  | "stale"
  | "failed"
  | "conflict";

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
  tip?: Tip;
  error?: string;
  isIdempotent?: boolean;
  /** Typed backend state when present (issue #1687). Older backends that
   *  don't send this yet fall back to the regex heuristics below. */
  state?: TipVerifyState;
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

  if (
    normalized.includes("reject") ||
    normalized.includes("declin") ||
    normalized.includes("denied") ||
    normalized.includes("cancel")
  ) {
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

function getResponseMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(" ");
  return typeof message === "string" ? message : undefined;
}

/** Typed `state` field from the backend, when present (issue #1687). */
function getResponseState(body: unknown): TipVerifyState | undefined {
  if (!body || typeof body !== "object") return undefined;
  const state = (body as { state?: unknown }).state;
  const known: TipVerifyState[] = [
    "verified",
    "duplicate",
    "pending",
    "stale",
    "failed",
    "conflict",
  ];
  return typeof state === "string" && (known as string[]).includes(state)
    ? (state as TipVerifyState)
    : undefined;
}

function getResponseCanRetry(body: unknown): boolean | undefined {
  if (!body || typeof body !== "object") return undefined;
  const canRetry = (body as { canRetry?: unknown }).canRetry;
  return typeof canRetry === "boolean" ? canRetry : undefined;
}

/**
 * Whether a response represents a safe, canonical replay of an
 * already-settled tip (i.e. a success, not an error).
 *
 * Prefers the typed `state` field when the backend sends one; falls back to
 * message-sniffing for backends that haven't rolled it out yet. The regex
 * fallback is intentionally kept — do not remove it without confirming the
 * backend always sends `state`.
 */
function isReplayResponse(
  status: number,
  message = "",
  state?: TipVerifyState,
): boolean {
  if (state) return state === "verified" || state === "duplicate";
  if (status !== 400 && status !== 409) return false;
  return /already (verified|recorded|processed)|idempotent|duplicate|replay/i.test(
    message,
  );
}

function shouldPollVerification(
  status: number,
  message = "",
  state?: TipVerifyState,
  canRetry?: boolean,
): boolean {
  // `pending` and `stale` are typed retryable states — the SLA/reconciliation
  // worker may resolve them shortly, so keep polling rather than surfacing
  // a hard failure to the user.
  if (state === "pending" || state === "stale") return true;
  if (state === "failed" || state === "conflict") return canRetry === true;
  if (canRetry === true) return true;
  return (
    status === 404 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    /pending|not (yet )?(found|confirmed)|try again|timeout|temporar/i.test(
      message,
    )
  );
}

// -------------------- Fake Checker --------------------

/**
 * Fake status checker — replace with actual backend or Stellar SDK call
 */
export const checkTransactionStatus = async (_txHash?: string): Promise<ActivityStatus> => {
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
  recipientAddress: string,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    if (amount < MIN_TIP_AMOUNT) {
      return {
        success: false,
        error: `Minimum tip amount is ${MIN_TIP_AMOUNT} XLM`,
      };
    }

    if (amount > MAX_TIP_AMOUNT) {
      return {
        success: false,
        error: `Maximum tip amount is ${MAX_TIP_AMOUNT} XLM`,
      };
    }

    // Validate precision: no more than TIP_PRECISION decimal places
    const amountStr = amount.toString();
    const decimalPart = amountStr.includes('.') ? amountStr.split('.')[1] : '';
    if (decimalPart.length > TIP_PRECISION) {
      return {
        success: false,
        error: `Tip amount cannot have more than ${TIP_PRECISION} decimal places`,
      };
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
    try {
      Keypair.fromPublicKey(recipientAddress);
    } catch {
      return { success: false, error: "Invalid recipient address" };
    }

    const transaction = new TransactionBuilder(senderAccount, {
      fee: BASE_FEE,
      networkPassphrase: network,
    })
      .addOperation(
        Operation.payment({
          destination: recipientAddress,
          asset: Asset.native(),
          amount: amount.toString(),
        }),
      )
      .setTimeout(30)
      .build();

    const signedXDR = await freighterSignTransaction(
      transaction.toXDR(),
      network,
    );
    const tx = TransactionBuilder.fromXDR(signedXDR, network);
    const result = await server.submitTransaction(tx);

    if (!result.hash)
      return { success: false, error: "No transaction hash returned" };

    return { success: true, txHash: result.hash };
  } catch (error) {
    console.error(error);
    return { success: false, error: classifyTipError(error) };
  }
}

// -------------------- Verify Tip --------------------

export async function verifyTip(
  confessionId: string,
  txHash: string,
): Promise<VerifyTipResult> {
  const maxAttempts = 2;
  let lastError = "Backend verification is still pending.";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(
        `/api/confessions/${confessionId}/tips/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txId: txHash }),
        },
      );
      const data = await res.json().catch(() => ({}));
      const message = getResponseMessage(data);
      const state = getResponseState(data);
      const canRetry = getResponseCanRetry(data);

      // Replaying the same verified transaction is a successful, stable state.
      if (res.ok || isReplayResponse(res.status, message, state)) {
        return {
          success: true,
          tip: (data as { tip?: Tip }).tip,
          state,
          isIdempotent:
            state === "duplicate" ||
            isReplayResponse(res.status, message, state) ||
            (data as { isIdempotent?: boolean }).isIdempotent,
        };
      }

      lastError = message || `Verification failed (${res.status})`;
      if (!shouldPollVerification(res.status, lastError, state, canRetry)) {
        return { success: false, error: lastError, state, canRetry };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < maxAttempts - 1) await sleep(1000);
  }

  return { success: false, error: lastError };
}

// -------------------- Get Tip Stats --------------------

export async function getTipStats(
  confessionId: string,
): Promise<TipStats | null> {
  try {
    const res = await fetch(
      `/api/confessions/${confessionId}/tips/stats`,
    );
    if (!res.ok) return null;
    return (await res.json()) as TipStats;
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
