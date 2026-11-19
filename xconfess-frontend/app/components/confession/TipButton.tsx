"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getTipStats, type TipStats } from "@/lib/services/tipping.service";
import { useTipStateMachine } from "@/lib/hooks/useTipStateMachine";
import { useWallet } from "@/lib/hooks/useWallet";
import { getWalletCTAState } from "@/lib/hooks/useWalletCTAState";
import { useActivityStore } from "@/app/lib/store/activity.store";
import { v4 as uuidv4 } from "uuid";
import { Wallet, AlertCircle, Coins } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { focusVisible } from "@/app/lib/utils/focusStyles";

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
  const [walletPin, setWalletPin] = useState("");
  const pathname = usePathname();

  const wallet = useWallet();
  const { isConnected, connect } = wallet;

  const { info, submit, retryVerify, cancel, reset } = useTipStateMachine({
    confessionId,
    recipientAddress,
    walletPin,
    onConfirmed: (hash) => {
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
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tip") === "1") {
      setIsOpen(true);
    }
  }, []);

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
    setWalletPin("");
  };

  const totalAmount = stats?.totalAmount || 0;
  const tipCount = stats?.totalCount || 0;
  const needsWallet = !isConnected || walletCTA.status === "not-installed";

  const stateLabel = {
    idle: null,
    submitting: "Signing & submitting…",
    pending: "Confirming on Stellar network…",
    verifying: "Verifying with backend…",
    confirmed: null,
    failed: null,
    stale: null,
  }[info.state];

  const stateDescription = {
    idle: null,
    submitting: "Your wallet is signing this transaction. Please approve in your wallet extension.",
    pending: "Transaction submitted to Stellar. Ledger finality takes 5–6 s.",
    verifying: "Confirming the transaction was recorded on-chain.",
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
          "flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] px-2.5 text-[var(--secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
          "disabled:opacity-50",
          focusVisible,
        )}
      >
        <Coins className="h-4 w-4" aria-hidden="true" />
        {needsWallet && <Wallet className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />}
        {tipCount > 0 && <span className="text-xs font-medium tabular-nums">{tipCount}</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-popover)]">
          <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Send tip</h3>

          {/* Wallet warnings */}
          {walletCTA.status === "not-installed" && (
            <div className="mb-3 p-3 rounded-[var(--radius-control)] bg-[var(--warning)]/5 border border-[var(--warning)]/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-[var(--warning)]" />
                <div>
                  <p className="text-xs text-[var(--warning)]">{walletCTA.guidance}</p>
                  <Link
                    href={`/wallet?returnTo=${encodeURIComponent(`${pathname || `/confessions/${confessionId}`}?tip=1`)}`}
                    className={cn("mt-2 inline-flex min-h-[36px] items-center rounded-[var(--radius-control)] bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--primary-hover)]", focusVisible)}
                  >
                    Create XConfess Wallet
                  </Link>
                </div>
              </div>
            </div>
          )}
          {walletCTA.status === "not-connected" && (
            <div className="mb-3 p-3 rounded-[var(--radius-control)] bg-[var(--surface-muted)] border border-[var(--border)]">
              <div className="flex items-start gap-2">
                <Wallet className="h-4 w-4 flex-shrink-0 mt-0.5 text-[var(--foreground)]" />
                <div>
                  <p className="text-xs text-[var(--foreground)] font-medium">Wallet not connected</p>
                  <p className="text-xs text-[var(--secondary)] mt-0.5">Your XConfess Wallet signs this tip locally.</p>
                </div>
              </div>
            </div>
          )}
          {walletCTA.status === "not-ready" && (
            <div className="mb-3 p-3 rounded-[var(--radius-control)] bg-[var(--warning)]/10 border border-[var(--warning)]/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-[var(--warning)]" />
                <p className="text-xs text-[var(--warning)]">{walletCTA.guidance}</p>
              </div>
            </div>
          )}

          {/* Pending / verifying progress */}
          {(info.state === "submitting" || info.state === "pending" || info.state === "verifying") && (
            <div className="mb-3 p-3 rounded-[var(--radius-control)] bg-[var(--warning)]/5 border border-[var(--warning)]/30">
              <div className="flex items-center gap-2 text-[var(--warning)] text-sm font-medium">
                <Spinner />
                <span>{stateLabel}</span>
              </div>
              {stateDescription && (
                <p className="text-[var(--warning)] text-xs mt-1">
                  {stateDescription}
                </p>
              )}
              {info.txHash && (
                <p className="mt-1 truncate font-mono text-xs text-[var(--secondary)]">
                  Tx: {info.txHash}
                </p>
              )}
              <button
                onClick={cancel}
                className={cn("mt-2 text-xs text-[var(--warning)] underline hover:opacity-80", focusVisible)}
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Stale — a submitted tx was recovered after a reload but is too old to auto-verify */}
          {info.state === "stale" && info.txHash && (
            <div className="mb-3 rounded-[var(--radius-control)] border border-[var(--warning)]/50 bg-[var(--warning)]/10 p-3">
              <div className="flex items-center gap-2 text-[var(--warning)] text-sm font-medium">
                <span>Verification link expired</span>
              </div>
              <p className="text-xs text-[var(--warning)] mt-1">
                This tip was submitted a while ago. It may have completed — check the explorer or retry verification.
              </p>
              <p className="mt-1 truncate font-mono text-xs text-[var(--secondary)]">Tx: {info.txHash}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={retryVerify}
                  disabled={isBusy}
                  className={cn("flex-1 rounded py-1.5 text-xs text-[#18181b] bg-[var(--warning)] hover:opacity-90 transition-colors disabled:opacity-50", focusVisible)}
                  aria-label="Retry verification"
                >
                  Retry Verification
                </button>
                {info.explorerUrl && (
                  <a
                    href={info.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn("rounded bg-[var(--surface-muted)] px-2 py-1.5 text-xs text-[var(--secondary)] hover:bg-[var(--surface-elevated)]", focusVisible)}
                  >
                    View on Explorer
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Confirmed */}
          {info.state === "confirmed" && info.txHash && (
            <div className="mb-3 p-3 rounded-[var(--radius-control)] bg-[var(--success)]/5 border border-[var(--success)]/30">
              <div className="flex items-center gap-2 text-[var(--success)] font-medium text-sm">
                <span>✓</span>
                <span>Tip confirmed</span>
              </div>
              <p className="text-[var(--success)] text-xs mt-1">{info.amount} XLM sent</p>
              <p className="mt-1 truncate font-mono text-xs text-[var(--secondary)]" title={info.txHash}>
                Tx: {info.txHash}
              </p>
              <span className="sr-only">Tip sent successfully</span>
              {info.explorerUrl && (
                <a
                  href={info.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("block mt-1 text-xs text-[var(--success)] underline hover:text-[var(--success)] truncate", focusVisible)}
                >
                  View on testnet.steexp.com
                </a>
              )}
            </div>
          )}

          {/* Failed with txHash — offer retry verify */}
          {info.state === "failed" && info.txHash && (
            <div className="mb-3 rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3">
              <div className="flex items-center gap-2 text-[var(--danger)] text-sm font-medium">
                <span>Verification failed</span>
              </div>
              <p className="text-xs text-[var(--danger)] mt-1">
                {info.error} Your XLM transaction was submitted; wait a moment and retry or check the explorer.
              </p>
              <p className="mt-1 truncate font-mono text-xs text-[var(--secondary)]">Tx: {info.txHash}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={retryVerify}
                  disabled={isBusy}
                  className={cn("flex-1 rounded py-1.5 text-xs text-white bg-[var(--danger)] hover:opacity-90 transition-colors disabled:opacity-50", focusVisible)}
                  aria-label="Retry verification"
                >
                  Retry Verification
                </button>
                {info.explorerUrl && (
                  <a
                    href={info.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn("rounded bg-[var(--surface-muted)] px-2 py-1.5 text-xs text-[var(--secondary)] hover:bg-[var(--surface-elevated)]", focusVisible)}
                  >
                    View on Explorer
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Failed without txHash — submission error */}
          {info.state === "failed" && !info.txHash && info.error && (
            <div className="mb-3 rounded-[var(--radius-control)] border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3">
              <p className="text-sm font-medium text-[var(--danger)]">Tip failed</p>
              <p className="text-xs text-[var(--danger)]">{info.error}</p>
              <button
                onClick={reset}
                className={cn("mt-2 text-xs text-[var(--danger)] underline hover:opacity-80", focusVisible)}
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
                  className={cn(
                    "w-full p-2 pr-12 bg-[var(--surface-strong)] text-[var(--foreground)] rounded-[var(--radius-control)] border border-[var(--border)] focus:border-[var(--focus-ring)] disabled:opacity-50",
                    focusVisible,
                  )}
                  aria-label="Tip amount in XLM"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--secondary)] text-sm">XLM</span>
              </div>
              <p className={cn("mt-2 text-xs", getTipAmountValidationError(tipAmount) ? "text-[var(--danger)]" : "text-[var(--secondary)]")}>
                {getTipAmountValidationError(tipAmount) ?? `Enter amount in ${TIP_UNIT} with ${TIP_STEP} precision. Minimum ${MIN_TIP_AMOUNT} ${TIP_UNIT}.`}
              </p>
              {wallet.publicKey && (
                <label htmlFor="tip-wallet-pin" className="mt-3 block text-left text-xs text-[var(--secondary)]">Wallet PIN
                  <input id="tip-wallet-pin" type="password" inputMode="numeric" value={walletPin} onChange={(e) => setWalletPin(e.target.value)} placeholder="Required to sign locally" className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-strong)] p-2 text-[var(--foreground)]" />
                </label>
              )}
              <button
                onClick={handleTip}
                disabled={walletCTA.disabled || isBusy || walletCTA.status === "not-installed"}
                className={cn(
                  "w-full mt-3 py-2.5 rounded-[var(--radius-control)] text-white font-medium transition-colors flex items-center justify-center gap-2",
                  walletCTA.status === "not-connected" ? "bg-[var(--primary)] hover:bg-[var(--primary-hover)]" : "bg-[var(--primary)] hover:bg-[var(--primary-hover)]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  focusVisible,
                )}
                aria-label={
                  isBusy ? stateLabel ?? "Processing…"
                  : walletCTA.status === "not-connected" ? "Connect Wallet to Tip"
                  : walletCTA.status === "not-installed" ? "Create an XConfess Wallet to tip"
                  : `Send ${tipAmount} XLM tip`
                }
              >
                {isBusy ? <><Spinner /><span>{stateLabel}</span></>
                  : walletCTA.status === "not-connected" ? <><Wallet className="h-4 w-4" />Connect Wallet to Tip</>
                  : `Tip ${tipAmount} XLM`}
              </button>
            </>
          )}

          <div className="text-xs text-[var(--text-muted)] mt-3 pt-2 border-t border-[var(--border)]">
            {totalAmount.toFixed(2)} XLM total • {tipCount} tip{tipCount !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
};
