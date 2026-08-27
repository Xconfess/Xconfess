export interface TrendingConfession {
  id: string;
  content: string;
  createdAt: string;
  reactionCount: number;
  reactions: {
    like: number;
    love: number;
  };
}

export interface ReactionDistribution {
  type: string;
  count: number;
  percentage: number;
}

export interface DailyActivity {
  date: string;
  confessions: number;
  reactions: number;
  activeUsers: number;
}

export interface AnalyticsData {
  trending: TrendingConfession[];
  reactionDistribution: ReactionDistribution[];
  dailyActivity: DailyActivity[];
  totalMetrics: {
    totalConfessions: number;
    totalReactions: number;
    totalUsers: number;
  };
  period: '24h' | '7days' | '30days' | 'all';
}
