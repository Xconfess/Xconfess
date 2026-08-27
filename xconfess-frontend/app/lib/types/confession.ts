import { TipStats } from "@/lib/services/tipping.service";

export interface ConfessionAuthor {
  id: string;
  username?: string;
  avatar?: string | null;
  stellarAddress?: string;
}

export interface ConfessionReactions {
  like: number;
  love: number;
  funny?: number;
  sad?: number;
}

export interface Confession {
  id: string;
  content: string;
  createdAt: string;
  reactions: ConfessionReactions;
  reactionCount?: number;
  author?: ConfessionAuthor;
  category?: string;
  isAnonymous?: boolean;
  commentCount?: number;
  viewCount?: number;
  isAnchored?: boolean;
  stellarTxHash?: string | null;
  tipStats?: TipStats;
}

export interface Comment {
  id: number;
  content: string;
  createdAt: string;
  author: string;
  confessionId?: string;
  parentId?: number | null;
  replies?: Comment[];
  isOptimistic?: boolean;
}
