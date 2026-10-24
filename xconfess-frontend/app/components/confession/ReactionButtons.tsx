"use client";

import { useState } from "react";
import { cn } from "@/app/lib/utils/cn";
import { useReactions } from "@/app/lib/hooks/useReactions";
import type { ReactionType } from "@/app/lib/types/reaction";

interface Props {
  type: ReactionType;
  count: number;
  confessionId: string;
  isActive?: boolean;
}

export const ReactionButton = ({
  type,
  count,
  confessionId,
  isActive = false,
}: Props) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const { addReaction, isPending, optimisticState, liveCounts, connectionState } = useReactions({
    confessionId,
    initialCounts: { like: 0, love: 0, [type]: count },
    initialUserReaction: isActive ? type : null,
  });

  // Use optimistic values when a mutation is in flight so that both the
  // count and the selected (active) state update immediately on click and
  // roll back cleanly if the server rejects the request. Fall back to the
  // live websocket count when there's no optimistic state in flight, so the
  // number doesn't revert to a stale prop after a reconnect resyncs it.
  const displayCount = optimisticState?.counts?.[type] ?? liveCounts?.[type] ?? count;
  const computedIsActive = optimisticState?.userReaction === type || isActive;
  const statusLabel = `Reaction live status: ${connectionState}`;

  const react = async () => {
    setError(null);
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    const result = await addReaction(confessionId, type);
    if (!result.ok) {
      const message = result.error.retryAfter
        ? `Too many reactions. Please wait ${result.error.retryAfter}s.`
        : result.error.message || "Failed to add reaction";
      setError(message);
    } else {
      setLiveMessage(`Reacted with ${type}.`);
    }
  };

  const label = computedIsActive
    ? `Reacted with ${type}, current count ${displayCount}`
    : `React with ${type}, current count ${displayCount}`;

  return (
    <div className="relative">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>
      <button
        onClick={react}
        disabled={isPending}
        aria-label={label}
        aria-pressed={computedIsActive}
        title={error || undefined}
        className={cn(
          "relative flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5",
          "min-w-11 touch-manipulation",
          "transition-colors duration-150",
          "border border-[var(--border)] bg-transparent text-[var(--secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          computedIsActive && "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--primary-deep)]",
          isAnimating && "animate-reaction-bounce",
          error && "border-[var(--danger)]"
        )}
      >
        <span className="text-sm leading-none select-none">
          {type === "like" ? "👍" : "❤️"}
        </span>

        <span className="text-xs font-medium tabular-nums">{displayCount}</span>
        <span
          role="status"
          aria-label={statusLabel}
          title={statusLabel}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            connectionState === "connected" && "bg-[var(--success)]",
            connectionState === "reconnecting" && "bg-[var(--warning)]",
            connectionState === "disconnected" && "bg-[var(--text-muted)]"
          )}
        />
      </button>

      {error && (
        <div role="alert" className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs text-[var(--danger)]">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};
