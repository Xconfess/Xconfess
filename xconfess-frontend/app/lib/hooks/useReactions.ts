"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { addReaction, type AddReactionResponse } from "@/app/lib/api/reactions";
import { getConfessionById } from "@/app/lib/api/confessions";
import {
  restoreQuerySnapshots,
  snapshotConfessionQueries,
  updateConfessionQueries,
} from "@/app/lib/api/confessionCache";
import type { ReactionType, ReactionCounts } from "@/app/lib/types/reaction";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { getWsUrl } from "@/app/lib/config";

export type ReactionConnectionState = "disconnected" | "reconnecting" | "connected";

type ReactionApiError = Extract<AddReactionResponse, { ok: false }>["error"];
type ReactionMutationError = Error & { apiError?: ReactionApiError };

type ReactionGatewayEventName =
  | "reaction:added"
  | "reaction:removed"
  | "confession:updated";

interface ReactionGatewayPayload {
  confessionId?: string;
  reactionId?: string;
  reactionType?: string;
  emoji?: string;
  timestamp?: string | Date;
  totalCount?: number;
  reactionCounts?: Record<string, number>;
}

const REACTION_EVENT_CACHE_LIMIT = 500;
// Module-level (shared across hook instances) so two ReactionButton
// instances subscribed to the same confession (e.g. one per reaction type)
// don't both patch the query cache for the same gateway event.
const processedReactionEvents = new Set<string>();

export interface ReactionState {
  counts: ReactionCounts;
  userReaction: ReactionType | null;
}

export interface UseReactionsOptions {
  /**
   * Visible confession to subscribe to for live reaction updates.
   */
  confessionId?: string;
  /**
   * Enables the live reaction socket. Defaults to true when a confessionId is provided.
   */
  enableRealtime?: boolean;
  /**
   * Initial reaction counts for the confession
   */
  initialCounts?: ReactionCounts;
  /**
   * Initial user reaction state (the reaction type the user already has)
   */
  initialUserReaction?: ReactionType | null;
  /**
   * Callback when reaction is successfully added
   */
  onSuccess?: (result: AddReactionResponse) => void;
  /**
   * Callback when reaction addition fails
   */
  onError?: (error: Error | AddReactionResponse) => void;
}

export interface UseReactionsReturn {
  /**
   * Add a reaction with optimistic update
   */
  addReaction: (confessionId: string, type: ReactionType) => Promise<AddReactionResponse>;
  /**
   * Remove a reaction (currently unsupported by the backend API)
   */
  removeReaction: (confessionId: string, type: ReactionType) => Promise<AddReactionResponse>;
  /**
   * Whether a mutation is in progress
   */
  isPending: boolean;
  /**
   * Whether there's an error
   */
  isError: boolean;
  /**
   * The error if any
   */
  error: Error | null;
  /**
   * Optimistic state for immediate UI updates
   */
  optimisticState: ReactionState | null;
  /**
   * Latest server/live counts known to this hook. Falls back to this once
   * optimistic state clears, so the displayed count doesn't revert to a
   * stale prop value while waiting for the parent to refetch.
   */
  liveCounts: ReactionCounts;
  /**
   * Current reaction websocket state for connection indicators.
   */
  connectionState: ReactionConnectionState;
  /**
   * Clear optimistic state (rollback)
   */
  clearOptimisticState: () => void;
  /**
   * Update optimistic counts directly
   */
  updateOptimisticCounts: (counts: ReactionCounts) => void;
  /**
   * Set error state for external handling
   */
  setErrorState: (error: Error | null) => void;
}

function normalizeCounts(counts?: Partial<ReactionCounts> | null): ReactionCounts {
  return {
    like: Math.max(0, counts?.like ?? 0),
    love: Math.max(0, counts?.love ?? 0),
  };
}

function incrementReactionCount(
  counts: Partial<ReactionCounts> | null | undefined,
  type: ReactionType,
): ReactionCounts {
  const normalized = normalizeCounts(counts);
  return {
    ...normalized,
    [type]: normalized[type] + 1,
  };
}

function normalizeReactionType(value?: string | null): ReactionType | null {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("love") || normalized.includes("heart") || normalized.includes("❤️")) {
    return "love";
  }
  if (normalized.includes("like") || normalized.includes("thumb") || normalized.includes("👍")) {
    return "like";
  }
  return null;
}

function normalizeGatewayCounts(
  counts?: Record<string, number> | null,
): ReactionCounts | null {
  if (!counts) {
    return null;
  }
  return normalizeCounts({
    like:
      counts.like ??
      counts["likes"] ??
      counts["👍"] ??
      counts["thumbs_up"] ??
      counts["thumbsup"],
    love:
      counts.love ??
      counts["loves"] ??
      counts["❤️"] ??
      counts["heart"] ??
      counts["hearts"],
  });
}

function rememberEventKey(
  cache: Set<string>,
  key: string,
  limit = REACTION_EVENT_CACHE_LIMIT,
) {
  if (cache.has(key)) {
    return false;
  }
  cache.add(key);
  if (cache.size > limit) {
    const oldest = cache.values().next().value;
    if (oldest) {
      cache.delete(oldest);
    }
  }
  return true;
}

function getGatewayEventKey(
  eventName: ReactionGatewayEventName,
  payload: ReactionGatewayPayload,
) {
  const countFingerprint = payload.reactionCounts
    ? JSON.stringify(payload.reactionCounts)
    : "";
  return [
    eventName,
    payload.confessionId ?? "",
    payload.reactionId ?? "",
    payload.reactionType ?? payload.emoji ?? "",
    payload.timestamp ? String(payload.timestamp) : "",
    payload.totalCount ?? "",
    countFingerprint,
  ].join(":");
}

function getReactionsSocketUrl() {
  return `${getWsUrl().replace(/\/$/, "")}/reactions`;
}

/**
 * Hook for managing reactions with optimistic updates and rollback, plus a
 * live websocket subscription that keeps reaction counts in sync across
 * disconnect/reconnect cycles.
 *
 * Features:
 * - Optimistic updates for immediate UI feedback
 * - Automatic rollback on error
 * - Cache invalidation after successful mutation
 * - Reconnecting websocket with exponential backoff; refetches counts on
 *   reconnect and exposes a connection state for UI indicators
 * - Exposed state for testing and debugging
 */
export function useReactions(options: UseReactionsOptions = {}): UseReactionsReturn {
  const {
    confessionId,
    enableRealtime = Boolean(options.confessionId),
    initialCounts,
    initialUserReaction,
    onSuccess,
    onError,
  } = options;
  const queryClient = useQueryClient();

  // Local state for optimistic UI updates (complements React Query cache)
  const [optimisticState, setOptimisticState] = useState<ReactionState | null>(null);
  const [localError, setLocalError] = useState<Error | null>(null);
  const [liveCounts, setLiveCounts] = useState<ReactionCounts>(() =>
    normalizeCounts(initialCounts),
  );
  const [connectionState, setConnectionState] =
    useState<ReactionConnectionState>("disconnected");
  const hasConnectedRef = useRef(false);
  const localEventKeysRef = useRef(new Set<string>());

  const initialLike = initialCounts?.like ?? 0;
  const initialLove = initialCounts?.love ?? 0;
  useEffect(() => {
    setLiveCounts(normalizeCounts({ like: initialLike, love: initialLove }));
  }, [initialLike, initialLove]);

  const patchReactionCounts = useCallback(
    (targetConfessionId: string, counts: ReactionCounts) => {
      updateConfessionQueries(queryClient, targetConfessionId, (confession) => ({
        ...confession,
        reactions: counts,
      }));
    },
    [queryClient],
  );

  const refreshReactionCounts = useCallback(async () => {
    if (!confessionId) {
      return;
    }
    const response = await getConfessionById(confessionId);
    if (!response.ok) {
      // We don't know what the current counts are — fall back to a broad
      // invalidation so any visible surfaces refetch from the server.
      queryClient.invalidateQueries({ queryKey: queryKeys.confessions.all });
      return;
    }
    const serverCounts = normalizeCounts(response.data.reactions);
    setLiveCounts(serverCounts);
    patchReactionCounts(confessionId, serverCounts);
  }, [confessionId, patchReactionCounts, queryClient]);

  const applyGatewayEvent = useCallback(
    (eventName: ReactionGatewayEventName, payload: ReactionGatewayPayload) => {
      if (!confessionId || payload.confessionId !== confessionId) {
        return;
      }

      const eventKey = getGatewayEventKey(eventName, payload);
      // Per-instance dedup: ignore events this hook instance already saw
      // (e.g. a stale socket re-delivering on reconnect).
      if (!rememberEventKey(localEventKeysRef.current, eventKey)) {
        return;
      }

      const gatewayCounts = normalizeGatewayCounts(payload.reactionCounts);
      const reactionType = normalizeReactionType(payload.reactionType ?? payload.emoji);

      if (!gatewayCounts && reactionType) {
        setLiveCounts((previous) => {
          const current = normalizeCounts(previous);
          const nextValue = Number.isFinite(payload.totalCount)
            ? Math.max(0, Number(payload.totalCount))
            : Math.max(
                0,
                current[reactionType] + (eventName === "reaction:removed" ? -1 : 1),
              );
          const updated = { ...current, [reactionType]: nextValue };
          // Module-level dedup: only one of the (potentially multiple)
          // hook instances subscribed to this confession patches the
          // shared query cache for a given event.
          if (rememberEventKey(processedReactionEvents, eventKey)) {
            patchReactionCounts(confessionId, updated);
          }
          return updated;
        });
        return;
      }

      if (!gatewayCounts) {
        return;
      }

      setLiveCounts(gatewayCounts);
      if (rememberEventKey(processedReactionEvents, eventKey)) {
        patchReactionCounts(confessionId, gatewayCounts);
      }
    },
    [confessionId, patchReactionCounts],
  );

  useEffect(() => {
    if (!enableRealtime || !confessionId) {
      return;
    }

    const socket = io(getReactionsSocketUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.3,
      withCredentials: true,
    });

    setConnectionState("reconnecting");

    socket.on("connect", () => {
      setConnectionState("connected");
      socket.emit("subscribe:confession", { confessionId });
      // Skip the refetch on the very first connect — initialCounts already
      // reflects the current server state. Only reconcile after a real
      // disconnect/reconnect cycle, where counts may have drifted.
      if (hasConnectedRef.current) {
        void refreshReactionCounts();
      }
      hasConnectedRef.current = true;
    });

    socket.on("disconnect", () => {
      setConnectionState("reconnecting");
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionState("reconnecting");
    });

    socket.io.on("reconnect_failed", () => {
      setConnectionState("disconnected");
    });

    socket.on("connect_error", () => {
      setConnectionState("reconnecting");
    });

    socket.on("reaction:added", (payload: ReactionGatewayPayload) => {
      applyGatewayEvent("reaction:added", payload);
    });
    socket.on("reaction:removed", (payload: ReactionGatewayPayload) => {
      applyGatewayEvent("reaction:removed", payload);
    });
    socket.on("confession:updated", (payload: ReactionGatewayPayload) => {
      applyGatewayEvent("confession:updated", payload);
    });

    return () => {
      socket.emit("unsubscribe:confession", { confessionId });
      socket.disconnect();
      hasConnectedRef.current = false;
      setConnectionState("disconnected");
    };
  }, [applyGatewayEvent, confessionId, enableRealtime, refreshReactionCounts]);

  const mutation = useMutation({
    mutationFn: async ({
      confessionId,
      type,
    }: {
      confessionId: string;
      type: ReactionType;
    }) => {
      const result = await addReaction(confessionId, type);

      if (!result.ok) {
        const mutationError = new Error(
          result.error.message || "Failed to add reaction",
        ) as ReactionMutationError;
        mutationError.apiError = result.error;
        throw mutationError;
      }

      return result;
    },

    // Called before the mutation function
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.confessions.all });
      const previousConfessionQueries = snapshotConfessionQueries(queryClient);

      updateConfessionQueries(
        queryClient,
        variables.confessionId,
        (confession) => ({
          ...confession,
          reactions: incrementReactionCount(
            confession.reactions as Partial<ReactionCounts> | undefined,
            variables.type,
          ),
        }),
      );

      // Set optimistic state for hook consumers
      const newCounts = incrementReactionCount(initialCounts, variables.type);

      setOptimisticState({
        counts: newCounts,
        userReaction: variables.type,
      });
      setLiveCounts(newCounts);
      setLocalError(null);

      // Return context with previous values for rollback
      return {
        previousConfessionQueries,
      };
    },

    // Called if mutation fails
    onError: (error, _variables, context) => {
      // Set error state
      setLocalError(error as Error);

      // Rollback to previous values
      restoreQuerySnapshots(queryClient, context?.previousConfessionQueries);

      // Clear optimistic state
      setOptimisticState(null);
      setLiveCounts(normalizeCounts(initialCounts));

      // Call error callback
      if (onError) {
        onError(error as Error);
      }
    },

    onSuccess: (result, variables) => {
      // Only update cache if we had optimistic state
      if (result.data.reactions) {
        const serverCounts = normalizeCounts(result.data.reactions);

        updateConfessionQueries(
          queryClient,
          variables.confessionId,
          (confession) => ({
            ...confession,
            reactions: serverCounts,
          }),
        );

        setOptimisticState({
          counts: serverCounts,
          userReaction: variables.type,
        });
        setLiveCounts(serverCounts);
      } else {
        queryClient.invalidateQueries({
          queryKey: queryKeys.confessions.all,
        });
      }
    },

    // Called after mutation settles (success or error)
    onSettled: () => {
      // Clear optimistic state after invalidation (keep for a moment for smooth UI)
      setTimeout(() => {
        setOptimisticState(null);
      }, 100);
    },
  });

  const handleAddReaction = useCallback(async (
    confessionId: string,
    type: ReactionType
  ): Promise<AddReactionResponse> => {
    // If user already has this reaction, skip optimistic update (no count change expected)
    const alreadyReacted = initialUserReaction === type;
    if (alreadyReacted) {
      // Still call the API to get the latest state, but don't optimistically update
      const result = await addReaction(confessionId, type);

      // Backend returns success with existing reaction (no change)
      // We don't need to do anything special here - the UI already shows the correct state
      if (result.ok && result.data.reactions) {
        const serverCounts = normalizeCounts(result.data.reactions);
        setLiveCounts(serverCounts);
        patchReactionCounts(confessionId, serverCounts);
      }

      if (onSuccess && result.ok) {
        onSuccess(result);
      }

      return result;
    }

    try {
      const result = await mutation.mutateAsync({ confessionId, type });

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (error) {
      // Error is already handled in onError callback
      const apiError = (error as ReactionMutationError).apiError;
      return {
        ok: false,
        error: {
          ...apiError,
          message:
            apiError?.message ||
            (error instanceof Error ? error.message : "Failed to add reaction"),
          code: "MUTATION_ERROR",
        },
      };
    }
  }, [mutation, onSuccess, initialUserReaction, patchReactionCounts]);

  const handleRemoveReaction = useCallback(async (
    _confessionId: string,
    _type: ReactionType
  ): Promise<AddReactionResponse> => {
    void _confessionId;
    void _type;
    const error = {
      message: "Removing reactions is not supported by the current API.",
      code: "UNSUPPORTED_OPERATION",
    } as const;

    setLocalError(new Error(error.message));
    return {
      ok: false,
      error,
    };
  }, []);

  const clearOptimisticState = useCallback(() => {
    setOptimisticState(null);
    setLocalError(null);
  }, []);

  const updateOptimisticCounts = useCallback((counts: ReactionCounts) => {
    setOptimisticState((prev) => {
      if (!prev) {
        return {
          counts,
          userReaction: initialUserReaction || null,
        };
      }
      return {
        ...prev,
        counts,
      };
    });
  }, [initialUserReaction]);

  const setErrorState = useCallback((error: Error | null) => {
    setLocalError(error);
  }, []);

  return {
    addReaction: handleAddReaction,
    removeReaction: handleRemoveReaction,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: localError || mutation.error,
    optimisticState,
    liveCounts,
    connectionState,
    clearOptimisticState,
    updateOptimisticCounts,
    setErrorState,
  };
}