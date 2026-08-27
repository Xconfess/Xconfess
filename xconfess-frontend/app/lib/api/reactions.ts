import { normalizeApiError, type ApiError } from "./errors";
import type { ReactionType, ReactionCounts } from "../types/reaction";
import { isValidReactionType, REACTION_EMOJI_MAP } from "../constants/reactions";
import { ANONYMOUS_USER_ID_KEY } from "./constants";

const API_BASE = "";

export type { ReactionType } from "../types/reaction";

export interface AddReactionResult {
  success: boolean;
  reactions?: ReactionCounts;
}

export type AddReactionResponse =
  | { ok: true; data: AddReactionResult }
  | { ok: false; error: ApiError };

/**
 * Adds a reaction (like or love) to a confession.
 */
export async function addReaction(
  confessionId: string,
  type: ReactionType,
  signal?: AbortSignal
): Promise<AddReactionResponse> {
  if (!confessionId) {
    return {
      ok: false,
      error: { message: "Confession ID is required.", code: "VALIDATION_ERROR" },
    };
  }
  
  // Use shared validation function
  if (!type || !isValidReactionType(type)) {
    return {
      ok: false,
      error: { message: "Invalid reaction type.", code: "VALIDATION_ERROR" },
    };
  }

  // Get anonymousUserId from localStorage
  const anonymousUserId = typeof window !== "undefined" 
    ? localStorage.getItem(ANONYMOUS_USER_ID_KEY)
    : null;

  if (!anonymousUserId) {
    return {
      ok: false,
      error: { 
        message: "Anonymous user ID not found. Please log in again.", 
        code: "AUTH_ERROR" 
      },
    };
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/reactions`,
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-anonymous-user-id": anonymousUserId,
        },
        body: JSON.stringify({ 
          confessionId,
          emoji: REACTION_EMOJI_MAP[type],
        }),
        signal,
      }
    );

    if (!response.ok) {
      const error = await normalizeApiError(response);
      return { ok: false, error };
    }

    const data = await response.json();
    return {
      ok: true,
      data: {
        success: data.success === true,
        reactions: data.reactions,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { message: "Request was cancelled." } };
    }
    const error = await normalizeApiError(
      err instanceof Error ? err : new Error(String(err))
    );
    return { ok: false, error };
  }
}
