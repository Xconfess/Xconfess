export interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  earnedAt?: string;
}

export interface UserStatistics {
  confessionsPosted: number;
  totalViews: number;
  reactionsGiven: number;
  reactionsReceived: number;
  tipsSent: number;
  tipsReceived: number;
  totalTipsSentAmount: number;
  totalTipsReceivedAmount: number;
  badgesEarned: number;
  joinDate: string;
  lastActive: string;
}

export interface UserProfile {
  id: string;
  username: string;
  isAnonymous: boolean;
  joinDate: string;
  lastActive: string;
  statistics: UserStatistics;
  badges?: Badge[];
}

export type ActivityType =
  | "confession"
  | "reaction"
  | "tip_sent"
  | "tip_received"
  | "badge_earned";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: string;
  data: {
    description?: string;
    confessionId?: string;
    confessionPreview?: string;
    amount?: number;
    recipientUsername?: string;
    senderUsername?: string;
    badgeName?: string;
    reactionType?: string;
  };
}

import { Confession } from "@/app/lib/types/confession";

export interface PaginatedConfessions {
  confessions: Confession[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ReactionHistoryItem {
  id: string;
  confessionId: string;
  confessionPreview: string;
  reactionType: string;
  createdAt: string;
}

export interface TipHistoryItem {
  id: string;
  amount: number;
  confessionId?: string;
  confessionPreview?: string;
  recipientUsername?: string;
  senderUsername?: string;
  createdAt: string;
  type: "sent" | "received";
}
