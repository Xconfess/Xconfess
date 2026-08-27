/**
 * Shared reaction constants for validation across frontend
 */

export const REACTION_TYPES = ["like", "love"] as const;

export type ReactionType = typeof REACTION_TYPES[number];

export const REACTION_EMOJI_MAP: Record<ReactionType, string> = {
  like: "👍",
  love: "❤️",
};

export function isValidReactionType(type: string): type is ReactionType {
  return REACTION_TYPES.includes(type as ReactionType);
}
