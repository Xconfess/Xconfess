export interface SearchConfession {
  id: string;
  content: string;
  createdAt: string;
  reactions: { like: number; love: number };
  commentCount?: number;
  viewCount?: number;
  author?: { id: string; username?: string; avatar?: string };
  isAnchored?: boolean;
  stellarTxHash?: string | null;
}

export interface SearchFilters {
  dateFrom?: string;
  dateTo?: string;
  minReactions?: number;
  sort: "newest" | "oldest" | "reactions";
  gender?: string;
}

export const DEFAULT_FILTERS: SearchFilters = {
  sort: "newest",
};

export const SORT_OPTIONS: { value: SearchFilters["sort"]; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "reactions", label: "Most reactions" },
];
