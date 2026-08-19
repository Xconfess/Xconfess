"use client";

import { useState, useEffect, useRef } from "react";
import { getTipStats, type TipStats } from "@/lib/services/tipping.service";
import { useTipStateMachine } from "@/lib/hooks/useTipStateMachine";
import { useWallet } from "@/lib/hooks/useWallet";
import { getWalletCTAState } from "@/lib/hooks/useWalletCTAState";
import { useActivityStore } from "@/app/lib/store/activity.store";
import { v4 as uuidv4 } from "uuid";
import { Wallet, AlertCircle } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

interface TipButtonProps {
  confessionId: string;
  recipientAddress?: string;
  initialStats?: TipStats;
}

const MIN_TIP_AMOUNT = 0.1;
const MAX_TIP_AMOUNT = 10_000;
const TIP_PRECISION = 7;
const TIP_STEP = 0.1;
const TIP_UNIT = "XLM";

function parseTipAmount(rawAmount: string): number | null {
  if (rawAmount.trim() === "") return null;
  const amount = Number(rawAmount);
  return Number.isFinite(amount) ? amount : null;
}

function getTipAmountValidationError(value: string): string | null {
  if (value.trim() === "") return `Enter a tip amount in ${TIP_UNIT}.`;
  const amount = parseTipAmount(value);
  if (amount === null) return "Enter a valid numeric amount.";
  if (amount === 0) return "Tip amount must be greater than zero.";
  if (amount < 0) return "Tip amount cannot be negative.";
  if (amount < MIN_TIP_AMOUNT) return `Minimum tip is ${MIN_TIP_AMOUNT} ${TIP_UNIT}.`;
  if (amount > MAX_TIP_AMOUNT) return `Maximum tip is ${MAX_TIP_AMOUNT} ${TIP_UNIT}.`;
  // Validate precision
  const amountStr = amount.toString();
  const decimalPart = amountStr.includes(".") ? amountStr.split(".")[1] : "";
  if (decimalPart.length > TIP_PRECISION) {
    return `Tip amount cannot have more than ${TIP_PRECISION} decimal places.`;
  }
  return null;
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export const TipButton = ({ confessionId, recipientAddress, initialStats }: TipButtonProps) => {
  const addActivity = useActivityStore((s) => s.addActivity);
  const updateActivity = useActivityStore((s) => s.updateActivity);
  const activityIdRef = useRef<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState(String(MIN_TIP_AMOUNT));
  const [stats, setStats] = useState<TipStats | null>(initialStats || null);

  const wallet = useWallet();
  const { isConnected, connect } = wallet;

  const { info, submit, retryVerify, cancel, reset } = useTipStateMachine({
    confessionId,
    recipientAddress,
    onConfirmed: (hash, amount) => {
      if (activityIdRef.current) {
        updateActivity(activityIdRef.current, { txHash: hash, status: "confirmed", updatedAt: Date.now() });
      }
      setTipAmount(String(MIN_TIP_AMOUNT));
      refreshStats();
    },
    onFailed: () => {
      if (activityIdRef.current) {
        updateActivity(activityIdRef.current, { status: "failed", updatedAt: Date.now() });
      }
    },
  });

  const isBusy = info.isBusy;
  const walletCTA = getWalletCTAState(wallet, { extraDisabled: isBusy });

  useEffect(() => {
    Promise.resolve(getTipStats(confessionId))
      .then((s) => { if (s) setStats(s); })
      .catch(() => {
        // Stats are supplemental; tipping should remain usable if they fail.
      });
  }, [confessionId]);

  const refreshStats = async () => {
    const updated = await getTipStats(confessionId);
    if (updated) setStats(updated);
  };

  const handleTip = async () => {
    if (isBusy) return;

    const validationError = getTipAmountValidationError(tipAmount);
    if (validationError) return;

    const amount = parseTipAmount(tipAmount)!;

    if (!isConnected) {
      try { await connect(); } catch { return; }
    }

    const id = uuidv4();
    activityIdRef.current = id;
    addActivity({ id, type: "tip", status: "submitted", createdAt: Date.now(), confessionId, amount });

    await submit(amount);
  };

  const totalAmount = stats?.totalAmount || 0;
  const tipCount = stats?.totalCount || 0;
  const needsWallet = !isConnected || walletCTA.status === "not-installed";

  const stateLabel = {
    idle: null,
    submitting: "Sending…",
    pending: "Waiting for Stellar confirmation…",
    verifying: "Verifying with backend…",
    confirmed: null,
    failed: null,
    stale: null,
  }[info.state];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!recipientAddress}
        aria-label="Tip confession"
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full transition-opacity",
          needsWallet ? "bg-purple-600/40 hover:bg-purple-600/50" : "bg-purple-600 hover:bg-purple-700",
          "disabled:opacity-50",
        )}
      >
        <span className="text-lg">💰</span>
        {needsWallet && <Wallet className="h-3.5 w-3.5 text-purple-300/70" />}
        {tipCount > 0 && <span className="text-sm font-medium text-white">{tipCount}</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-zinc-800 p-4 rounded-xl shadow-xl z-50">
          <h3 className="text-white font-semibold mb-3">Send Tip</h3>

          {/* Wallet warnings */}
          {walletCTA.status === "not-installed" && (
            <div className="mb-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-yellow-500" />
                <p className="text-xs text-yellow-400">{walletCTA.guidance}</p>
              </div>
            </div>
          )}
          {walletCTA.status === "not-connected" && (
            <div className="mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-start gap-2">
                <Wallet className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-400" />
                <div>
                  <p className="text-xs text-blue-400 font-medium">Wallet not connected</p>
                  <p className="text-xs text-blue-300/70 mt-0.5">Connect your Freighter wallet to send tips on Stellar.</p>
                </div>
              </div>
            </div>
          )}
          {walletCTA.status === "not-ready" && (
            <div className="mb-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-orange-400" />
                <p className="text-xs text-orange-400">{walletCTA.guidance}</p>
              </div>
            </div>
          )}

          {/* Pending / verifying progress */}
          {(info.state === "submitting" || info.state === "pending" || info.state === "verifying") && (
            <div className="mb-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50">
              <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium">
                <Spinner />
                <span>{stateLabel}</span>
              </div>
              {info.state === "pending" && (
                <p className="text-yellow-300 text-xs mt-1">
                  Stellar ledger finality takes 5–6 s. Please wait…
                </p>
              )}
              {info.txHash && (
                <p className="mt-1 truncate font-mono text-xs text-zinc-400">
                  Tx: {info.txHash}
                </p>
              )}
              <button
                onClick={cancel}
                className="mt-2 text-xs text-yellow-300 underline hover:text-yellow-200"
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Stale — a submitted tx was recovered after a reload but is too old to auto-verify */}
          {info.state === "stale" && info.txHash && (
            <div className="mb-3 rounded-lg border border-orange-700/50 bg-orange-900/30 p-3">
              <div className="flex items-center gap-2 text-orange-400 text-sm font-medium">
                <span>Verification link expired</span>
              </div>
              <p className="text-xs text-orange-400 mt-1">
                This tip was submitted a while ago. It may have completed — check the explorer or retry verification.
              </p>
              <p className="mt-1 truncate font-mono text-xs text-zinc-400">Tx: {info.txHash}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={retryVerify}
                  disabled={isBusy}
                  className="flex-1 rounded py-1.5 text-xs text-white bg-orange-700 hover:bg-orange-600 transition-colors disabled:opacity-50"
                  aria-label="Retry verification"
                >
                  Retry Verification
                </button>
                {info.explorerUrl && (
                  <a
                    href={info.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-zinc-700 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600"
                  >
                    View on Explorer
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Confirmed */}
          {info.state === "confirmed" && info.txHash && (
            <div className="mb-3 p-3 rounded-lg bg-green-900/30 border border-green-700/50">
              <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
                <span>✓</span>
                <span>Tip confirmed</span>
              </div>
              <p className="text-green-300 text-xs mt-1">{info.amount} XLM sent</p>
              <p className="mt-1 truncate font-mono text-xs text-green-300/70" title={info.txHash}>
                Tx: {info.txHash}
              </p>
              <span className="sr-only">Tip sent successfully</span>
              {info.explorerUrl && (
                <a
                  href={info.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1 text-xs text-green-400 underline hover:text-green-300 truncate"
                >
                  View on testnet.steexp.com
                </a>
              )}
            </div>
          )}

          {/* Failed with txHash — offer retry verify */}
          {info.state === "failed" && info.txHash && (
            <div className="mb-3 rounded-lg border border-red-700/50 bg-red-900/30 p-3">
              <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                <span>Verification failed</span>
              </div>
              <p className="text-xs text-red-400 mt-1">
                {info.error} Your XLM transaction was submitted; wait a moment and retry or check the explorer.
              </p>
              <p className="mt-1 truncate font-mono text-xs text-zinc-400">Tx: {info.txHash}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={retryVerify}
                  disabled={isBusy}
                  className="flex-1 rounded py-1.5 text-xs text-white bg-red-700 hover:bg-red-600 transition-colors disabled:opacity-50"
                  aria-label="Retry verification"
                >
                  Retry Verification
                </button>
                {info.explorerUrl && (
                  <a
                    href={info.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-zinc-700 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600"
                  >
                    View on Explorer
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Failed without txHash — submission error */}
          {info.state === "failed" && !info.txHash && info.error && (
            <div className="mb-3 rounded-lg border border-red-700/50 bg-red-900/30 p-3">
              <p className="text-sm font-medium text-red-400">Tip failed</p>
              <p className="text-xs text-red-400">{info.error}</p>
              <button
                onClick={reset}
                className="mt-2 text-xs text-red-300 underline hover:text-red-200"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Input + send — hidden while confirmed or in-flight with a hash */}
          {info.state !== "confirmed" && !info.txHash && (
            <>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  min={MIN_TIP_AMOUNT}
                  step={TIP_STEP}
                  disabled={isBusy}
                  className="w-full p-2 pr-12 bg-zinc-900 text-white rounded-lg border border-zinc-700 focus:border-purple-500 focus:outline-none disabled:opacity-50"
                  aria-label="Tip amount in XLM"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">XLM</span>
              </div>
              <p className={cn("mt-2 text-xs", getTipAmountValidationError(tipAmount) ? "text-red-400" : "text-zinc-400")}>
                {getTipAmountValidationError(tipAmount) ?? `Enter amount in ${TIP_UNIT} with ${TIP_STEP} precision. Minimum ${MIN_TIP_AMOUNT} ${TIP_UNIT}.`}
              </p>
              <button
                onClick={handleTip}
                disabled={walletCTA.disabled || isBusy || walletCTA.status === "not-installed"}
                className={cn(
                  "w-full mt-3 py-2.5 rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2",
                  walletCTA.status === "not-connected" ? "bg-blue-600 hover:bg-blue-500" : "bg-purple-600 hover:bg-purple-500",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                aria-label={
                  isBusy ? stateLabel ?? "Processing…"
                  : walletCTA.status === "not-connected" ? "Connect Wallet to Tip"
                  : walletCTA.status === "not-installed" ? "Wallet required — install Freighter"
                  : `Send ${tipAmount} XLM tip`
                }
              >
                {isBusy ? <><Spinner /><span>{stateLabel}</span></>
                  : walletCTA.status === "not-connected" ? <><Wallet className="h-4 w-4" />Connect Wallet to Tip</>
                  : `Tip ${tipAmount} XLM`}
              </button>
            </>
          )}

          <div className="text-xs text-zinc-500 mt-3 pt-2 border-t border-zinc-700">
            {totalAmount.toFixed(2)} XLM total • {tipCount} tip{tipCount !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
};
