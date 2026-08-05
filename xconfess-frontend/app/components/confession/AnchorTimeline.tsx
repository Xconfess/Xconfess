"use client";

import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { getStellarExplorerUrl } from "@/app/lib/utils/stellar";
import type { ActivityStatus } from "@/app/lib/types/activity";

interface TimelineStep {
  key: string;
  label: string;
  state: "done" | "active" | "pending" | "error";
  timestamp?: number;
  txHash?: string | null;
  error?: string | null;
  onRetry?: () => void;
}

interface AnchorTimelineProps {
  status: ActivityStatus;
  txHash?: string | null;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

function buildSteps(props: AnchorTimelineProps): TimelineStep[] {
  const { status, txHash, error, onRetry } = props;

  if (status === "requested") {
    return [
      { key: "requested", label: "Requested", state: "active", timestamp: Date.now() },
      { key: "submitted", label: "Submitted", state: "pending" },
      { key: "confirmed", label: "Confirmed", state: "pending" },
    ];
  }

  if (status === "submitted") {
    return [
      { key: "requested", label: "Requested", state: "done" },
      { key: "submitted", label: "Submitted", state: "active", txHash },
      { key: "confirmed", label: "Confirmed", state: "pending" },
    ];
  }

  if (status === "confirmed") {
    return [
      { key: "requested", label: "Requested", state: "done" },
      { key: "submitted", label: "Submitted", state: "done" },
      { key: "confirmed", label: "Confirmed", state: "done", txHash },
    ];
  }

  if (status === "failed") {
    return [
      { key: "requested", label: "Requested", state: "done" },
      { key: "submitted", label: "Submitted", state: "done" },
      { key: "failed", label: "Failed", state: "error", error, onRetry },
    ];
  }

  if (status === "expired") {
    return [
      { key: "requested", label: "Requested", state: "done" },
      { key: "submitted", label: "Submitted", state: "done" },
      { key: "expired", label: "Expired", state: "error" },
    ];
  }

  return [];
}

function StepDot({ step }: { step: TimelineStep }) {
  const dotClass = cn(
    "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
    step.state === "done" && "border-green-500 bg-green-500 text-white",
    step.state === "active" && "border-blue-500 bg-blue-500 text-white",
    step.state === "pending" && "border-zinc-600 bg-zinc-800 text-zinc-500",
    step.state === "error" && "border-red-500 bg-red-500 text-white",
  );

  return (
    <div className={dotClass} aria-hidden="true">
      {step.state === "done" && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
      {step.state === "active" && step.key === "submitted" && (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      )}
      {step.state === "active" && step.key !== "submitted" && (
        <Clock className="h-3 w-3" aria-hidden="true" />
      )}
      {step.state === "pending" && <div className="h-2 w-2 rounded-full bg-zinc-600" aria-hidden="true" />}
      {step.state === "error" && <XCircle className="h-3 w-3" aria-hidden="true" />}
    </div>
  );
}

export function AnchorTimeline({
  status,
  txHash,
  error,
  onRetry,
  className,
}: AnchorTimelineProps) {
  const steps = buildSteps({ status, txHash, error, onRetry });

  if (steps.length === 0) return null;

  return (
    <div
      className={cn("flex flex-col", className)}
      role="region"
      aria-label="Anchor transaction progress timeline"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {status === "confirmed" && "Anchor transaction confirmed successfully."}
        {status === "failed" && `Anchor transaction failed: ${error || "Unknown error"}`}
        {status === "submitted" && "Anchor transaction submitted to the Stellar network."}
        {status === "requested" && "Anchor transaction requested."}
      </div>

      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const isConnectorActive = step.state === "done" || step.state === "active";

        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StepDot step={step} />
              {!isLast && (
                <div
                  className={cn(
                    "ml-0 h-full w-0.5 transition-colors",
                    isConnectorActive ? "bg-blue-500" : "bg-zinc-700",
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-5")}>
              <p
                className={cn(
                  "text-sm font-medium",
                  step.state === "done" && "text-zinc-300",
                  step.state === "active" && "text-white",
                  step.state === "pending" && "text-zinc-500",
                  step.state === "error" && "text-red-400",
                )}
              >
                {step.label}
              </p>

              {step.state === "active" && step.key === "submitted" && (
                <p className="mt-0.5 text-xs text-zinc-400">
                  Transaction submitted to the Stellar network
                </p>
              )}

              {step.state === "active" && step.key === "requested" && (
                <p className="mt-0.5 text-xs text-zinc-400">
                  Preparing anchor transaction...
                </p>
              )}

              {step.state === "done" && step.key === "confirmed" && step.txHash && (
                <a
                  href={getStellarExplorerUrl(step.txHash) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  aria-label="View transaction on Stellar explorer (opens in a new tab)"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  View transaction
                </a>
              )}

              {step.state === "error" && (
                <div className="mt-1 space-y-1" role="alert">
                  {step.error ? (
                    <p className="text-xs text-red-400">{step.error}</p>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Anchor confirmation failed
                    </p>
                  )}
                  {step.onRetry ? (
                    <button
                      type="button"
                      onClick={step.onRetry}
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded px-1 py-0.5"
                      aria-label="Retry anchoring transaction"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Retry anchoring
                    </button>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      Try connecting your wallet and anchoring again.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}