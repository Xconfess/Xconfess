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
    }
  };

  const label = computedIsActive
    ? `Reacted with ${type}, current count ${displayCount}`
    : `React with ${type}, current count ${displayCount}`;

  return (
    <div className="relative">
      <button
        onClick={react}
        disabled={isPending}
        aria-label={label}
        aria-pressed={computedIsActive}
        title={error || undefined}
        className={cn(
          "relative flex items-center gap-2 px-4 py-2 rounded-full",
          "min-w-11 min-h-11 touch-manipulation",
          "transition-all duration-200 ease-out",
          "bg-zinc-800 hover:bg-zinc-700",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500",
          "active:scale-95",
          computedIsActive && "bg-pink-600 text-white",
          isAnimating && "animate-reaction-bounce",
          error && "ring-2 ring-red-500"
        )}
      >
        <span className="text-lg select-none">
          {type === "like" ? "👍" : "❤️"}
        </span>

        <span className="text-sm font-medium">{displayCount}</span>
        <span
          role="status"
          aria-label={statusLabel}
          title={statusLabel}
          className={cn(
            "h-2 w-2 rounded-full",
            connectionState === "connected" && "bg-emerald-400",
            connectionState === "reconnecting" && "bg-amber-400 animate-pulse",
            connectionState === "disconnected" && "bg-zinc-500"
          )}
        />
      </button>

      {error && (
        <div role="alert" className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
            {error}
          </div>
        </div>
      )}
    </div>
  );
};
