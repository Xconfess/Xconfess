"use client";

import {
  MessageSquare,
  Eye,
  Heart,
  DollarSign,
  Award,
  TrendingUp,
} from "lucide-react";

interface Statistics {
  confessionsPosted: number;
  totalViews: number;
  reactionsGiven: number;
  reactionsReceived: number;
  tipsSent: number;
  tipsReceived: number;
  totalTipsSentAmount: number;
  totalTipsReceivedAmount: number;
  badgesEarned: number;
}

interface UserStatisticsProps {
  statistics: Statistics;
}

export function UserStatistics({ statistics }: UserStatisticsProps) {
  const statCards = [
    {
      label: "Confessions Posted",
      value: statistics.confessionsPosted,
      icon: MessageSquare,
      color: "bg-[var(--primary)]",
      bgColor: "bg-[var(--accent-soft)]",
      textColor: "text-[var(--primary-deep)]",
    },
    {
      label: "Total Views",
      value: statistics.totalViews.toLocaleString(),
      icon: Eye,
      color: "bg-[var(--primary)]",
      bgColor: "bg-[var(--accent-soft)]",
      textColor: "text-[var(--primary-deep)]",
    },
    {
      label: "Reactions Given",
      value: statistics.reactionsGiven,
      icon: Heart,
      color: "bg-[var(--primary)]",
      bgColor: "bg-[var(--accent-soft)]",
      textColor: "text-[var(--primary-deep)]",
    },
    {
      label: "Reactions Received",
      value: statistics.reactionsReceived,
      icon: TrendingUp,
      color: "bg-[var(--success)]",
      bgColor: "bg-[var(--success)]/10",
      textColor: "text-[var(--success)]",
    },
    {
      label: "Tips Sent",
      value: statistics.tipsSent,
      subValue: `$${statistics.totalTipsSentAmount.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-[var(--warning)]",
      bgColor: "bg-[var(--warning)]/10",
      textColor: "text-[var(--warning)]",
    },
    {
      label: "Tips Received",
      value: statistics.tipsReceived,
      subValue: `$${statistics.totalTipsReceivedAmount.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-[var(--warning)]",
      bgColor: "bg-[var(--warning)]/10",
      textColor: "text-[var(--warning)]",
    },
    {
      label: "Badges Earned",
      value: statistics.badgesEarned,
      icon: Award,
      color: "bg-[var(--primary)]",
      bgColor: "bg-[var(--accent-soft)]",
      textColor: "text-[var(--primary-deep)]",
    },
  ];

  return (
    <div>
      <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-4">Your Statistics</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;

          return (
            <div
              key={index}
              className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-[var(--text-muted)]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--secondary)]">
                  {stat.label}
                </p>
                <p className="text-2xl font-semibold tabular-nums text-[var(--foreground)]">{stat.value}</p>
                {stat.subValue && (
                  <p className={`text-sm font-medium ${stat.textColor}`}>
                    {stat.subValue}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Engagement Summary */}
      <div className="mt-6 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Engagement summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-[var(--secondary)]">Total Activity</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--foreground)]">
              {statistics.confessionsPosted + statistics.reactionsGiven}
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--secondary)]">Engagement Rate</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--foreground)]">
              {statistics.confessionsPosted > 0
                ? (
                    (statistics.reactionsReceived /
                      statistics.confessionsPosted) *
                    100
                  ).toFixed(1)
                : 0}
              %
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--secondary)]">Avg Views/Post</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--foreground)]">
              {statistics.confessionsPosted > 0
                ? Math.round(
                    statistics.totalViews / statistics.confessionsPosted
                  )
                : 0}
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--secondary)]">Community Score</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--foreground)]">
              {Math.min(
                Math.round(
                  (statistics.reactionsGiven * 0.5 +
                    statistics.reactionsReceived * 0.3 +
                    statistics.tipsSent * 2 +
                    statistics.badgesEarned * 10) /
                    10
                ),
                100
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
