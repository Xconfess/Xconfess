"use client";

/**
 * useTipStateMachine
 *
 * Encapsulates the pending → confirmed/failed lifecycle for on-chain tips.
 * Polls Horizon for transaction status so the UI reflects real ledger finality
 * rather than just backend acknowledgement.
 *
 * States
 *   idle        — no tip in progress
 *   submitting  — building + signing + submitting tx to Stellar (covers wallet
 *                 rejection / disconnect, which surface here as a `failed`
 *                 transition with no txHash — fully recoverable via `reset`)
 *   pending     — tx submitted; polling Horizon for ledger inclusion (5-6 s typical)
 *   verifying   — tx confirmed on-chain; backend verification in progress
 *   confirmed   — backend verified; tip credited
 *   failed      — any step failed; `error` contains human-readable reason
 *   stale       — a submitted tx was recovered from a previous page load but
 *                 is too old to trust further; manual retry/explorer check only
 *
 * Duplicate protection
 *   `inFlightRef` blocks concurrent calls to `submit`/`retryVerify`, including
 *   the automatic resume-on-mount verification below.
 *
 * Reload resilience
 *   Once a transaction hash is obtained, it is persisted to localStorage keyed
 *   by confessionId. On mount, a pending record resumes backend verification
 *   automatically so a reload after submission does not strand the user.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { sendTip, verifyTip } from "@/lib/services/tipping.service";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const HORIZON_MAINNET = "https://horizon.stellar.org";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 8; // ~16 s max wait (covers 5-6 s Stellar finality + margin)
const PERSIST_KEY_PREFIX = "xconfess:pendingTip:";
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 min

export type TipState =
  | "idle"
  | "submitting"
  | "pending"
  | "verifying"
  | "confirmed"
  | "failed"
  | "stale";

export interface TipStateInfo {
  state: TipState;
  txHash: string | null;
  amount: number | null;
  error: string | null;
  explorerUrl: string | null;
  isBusy: boolean;
}

interface PersistedTip {
  txHash: string;
  amount: number;
  submittedAt: number;
}

function getHorizonBase(): string {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
  return network === "mainnet" ? HORIZON_MAINNET : HORIZON_TESTNET;
}

function getSteexpUrl(txHash: string): string {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
  if (network === "mainnet") {
    return `https://stellar.expert/explorer/public/tx/${txHash}`;
  }
  return `https://testnet.steexp.com/tx/${txHash}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadPersistedTip(confessionId: string): PersistedTip | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY_PREFIX + confessionId);
    return raw ? (JSON.parse(raw) as PersistedTip) : null;
  } catch {
    return null;
  }
}

function savePersistedTip(confessionId: string, tip: PersistedTip): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERSIST_KEY_PREFIX + confessionId, JSON.stringify(tip));
  } catch {
    /* localStorage unavailable (private mode, quota) — resume-on-reload degrades gracefully */
  }
}

function clearPersistedTip(confessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PERSIST_KEY_PREFIX + confessionId);
  } catch {
    /* no-op */
  }
}

type HorizonTxStatus = "pending" | "confirmed" | "failed" | "not_found";

async function pollHorizonStatus(txHash: string): Promise<HorizonTxStatus> {
  const url = `${getHorizonBase()}/transactions/${txHash}`;
  try {
    const res = await fetch(url);
    if (res.status === 404) return "not_found";
    if (!res.ok) return "pending";
    const data = await res.json();
    // Horizon returns `successful: true/false` for included transactions
    if (typeof data.successful === "boolean") {
      return data.successful ? "confirmed" : "failed";
    }
    return "pending";
  } catch {
    return "pending";
  }
}

async function waitForHorizonConfirmation(
  txHash: string,
  isCancelled: () => boolean,
): Promise<"confirmed" | "failed" | "timeout" | "cancelled"> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    if (isCancelled()) return "cancelled";
    const status = await pollHorizonStatus(txHash);
    if (status === "confirmed") return "confirmed";
    if (status === "failed") return "failed";
  }
  return "timeout";
}

export interface UseTipStateMachineOptions {
  confessionId: string;
  recipientAddress: string | undefined;
  onConfirmed?: (txHash: string, amount: number) => void;
  onFailed?: (error: string) => void;
}

export function useTipStateMachine({
  confessionId,
  recipientAddress,
  onConfirmed,
  onFailed,
}: UseTipStateMachineOptions) {
  const [state, setState] = useState<TipState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const cancelledRef = useRef(false);
  const resumedRef = useRef(false);

  const isBusy =
    state === "submitting" || state === "pending" || state === "verifying";

  const explorerUrl = txHash ? getSteexpUrl(txHash) : null;

  const reset = useCallback(() => {
    if (inFlightRef.current) return;
    clearPersistedTip(confessionId);
    setState("idle");
    setTxHash(null);
    setAmount(null);
    setError(null);
  }, [confessionId]);

  const submit = useCallback(
    async (tipAmount: number) => {
      if (inFlightRef.current || isBusy) return;
      if (!recipientAddress) {
        setError("Recipient address not available");
        setState("failed");
        return;
      }

      inFlightRef.current = true;
      cancelledRef.current = false;
      setState("submitting");
      setError(null);
      setTxHash(null);
      setAmount(tipAmount);

      try {
        // --- Phase 1: submit to Stellar ---
        // Wallet rejection/disconnect during signing surfaces as a thrown
        // error here and lands in `failed` with no txHash — fully
        // recoverable: the input reappears and the user can retry from scratch.
        const sendResult = await sendTip(confessionId, tipAmount, recipientAddress);
        if (cancelledRef.current) return;
        if (!sendResult.success || !sendResult.txHash) {
          throw new Error(sendResult.error || "Failed to submit transaction");
        }

        const hash = sendResult.txHash;
        setTxHash(hash);
        setState("pending");
        savePersistedTip(confessionId, { txHash: hash, amount: tipAmount, submittedAt: Date.now() });

        // --- Phase 2: poll Horizon until ledger inclusion ---
        const horizonResult = await waitForHorizonConfirmation(hash, () => cancelledRef.current);
        if (horizonResult === "cancelled") return;
        if (horizonResult === "failed") {
          throw new Error("Transaction was rejected by the Stellar network");
        }
        if (horizonResult === "timeout") {
          throw new Error(
            "Transaction is taking longer than expected. Check the explorer link below.",
          );
        }

        // --- Phase 3: backend verification ---
        setState("verifying");
        const verifyResult = await verifyTip(confessionId, hash);
        if (cancelledRef.current) return;
        if (!verifyResult.success) {
          throw new Error(
            verifyResult.error || "Backend verification still pending.",
          );
        }

        setState("confirmed");
        clearPersistedTip(confessionId);
        onConfirmed?.(hash, tipAmount);
      } catch (err) {
        if (cancelledRef.current) return;
        const msg = err instanceof Error ? err.message : "Failed to send tip";
        setError(msg);
        setState("failed");
        onFailed?.(msg);
      } finally {
        inFlightRef.current = false;
      }
    },
    [confessionId, recipientAddress, isBusy, onConfirmed, onFailed],
  );

  /** Retry backend verification only — does NOT re-send the transaction. */
  const retryVerify = useCallback(async () => {
    if (inFlightRef.current || !txHash) return;

    inFlightRef.current = true;
    cancelledRef.current = false;
    setState("verifying");
    setError(null);

    try {
      const verifyResult = await verifyTip(confessionId, txHash);
      if (cancelledRef.current) return;
      if (!verifyResult.success) {
        throw new Error(verifyResult.error || "Backend verification still pending.");
      }
      setState("confirmed");
      clearPersistedTip(confessionId);
      onConfirmed?.(txHash, amount ?? 0);
    } catch (err) {
      if (cancelledRef.current) return;
      const msg = err instanceof Error ? err.message : "Verification failed";
      setError(msg);
      setState("failed");
      onFailed?.(msg);
    } finally {
      inFlightRef.current = false;
    }
  }, [confessionId, txHash, amount, onConfirmed, onFailed]);

  /**
   * Cancel an in-flight submit/verify. The underlying Stellar transaction may
   * already be broadcast and cannot be un-sent, so cancelling lands on
   * `failed` (with the txHash preserved for explorer/retry) rather than
   * silently discarding a possibly-successful transaction.
   */
  const cancel = useCallback(() => {
    if (!isBusy) return;
    cancelledRef.current = true;
    inFlightRef.current = false;

    if (txHash) {
      setError("Cancelled. Your transaction may still be processing — check the explorer or retry verification.");
      setState("failed");
    } else {
      setState("idle");
      setError(null);
    }
  }, [isBusy, txHash]);

  // Resume verification for a tip that was submitted before a page reload.
  // Guarded against React StrictMode's double-invoke and against racing an
  // already-in-flight submit/retry so verifyTip is never called twice.
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;

    const persisted = loadPersistedTip(confessionId);
    if (!persisted || inFlightRef.current) return;

    setTxHash(persisted.txHash);
    setAmount(persisted.amount);

    const age = Date.now() - persisted.submittedAt;
    if (age > STALE_AFTER_MS) {
      setState("stale");
      return;
    }

    inFlightRef.current = true;
    setState("verifying");

    verifyTip(confessionId, persisted.txHash)
      .then((verifyResult) => {
        if (verifyResult.success) {
          setState("confirmed");
          clearPersistedTip(confessionId);
          onConfirmed?.(persisted.txHash, persisted.amount);
        } else {
          setState("failed");
          const msg = verifyResult.error || "Backend verification still pending.";
          setError(msg);
          onFailed?.(msg);
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Verification failed";
        setState("failed");
        setError(msg);
        onFailed?.(msg);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confessionId]);

  const info: TipStateInfo = { state, txHash, amount, error, explorerUrl, isBusy };

  return { info, submit, retryVerify, cancel, reset };
}
