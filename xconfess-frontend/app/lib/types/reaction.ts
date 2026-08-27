/**
 * Shared reaction types for API contracts and UI
 * Uses constants from shared constants file
 */

import type { ReactionType as SharedReactionType } from "../constants/reactions";

export type ReactionType = SharedReactionType;

export interface ReactionCounts {
  like: number;
  love: number;
}

export interface AddReactionResult {
  success: boolean;
  reactions?: ReactionCounts;
}
