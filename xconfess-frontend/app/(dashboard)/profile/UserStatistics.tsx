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
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-700",
    },
    {
      label: "Total Views",
      value: statistics.totalViews.toLocaleString(),
      icon: Eye,
      color: "bg-purple-500",
      bgColor: "bg-purple-50",
      textColor: "text-purple-700",
    },
    {
      label: "Reactions Given",
      value: statistics.reactionsGiven,
      icon: Heart,
      color: "bg-pink-500",
      bgColor: "bg-pink-50",
      textColor: "text-pink-700",
    },
    {
      label: "Reactions Received",
      value: statistics.reactionsReceived,
      icon: TrendingUp,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-700",
    },
    {
      label: "Tips Sent",
      value: statistics.tipsSent,
      subValue: `$${statistics.totalTipsSentAmount.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-yellow-500",
      bgColor: "bg-yellow-50",
      textColor: "text-yellow-700",
    },
    {
      label: "Tips Received",
      value: statistics.tipsReceived,
      subValue: `$${statistics.totalTipsReceivedAmount.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-orange-500",
      bgColor: "bg-orange-50",
      textColor: "text-orange-700",
    },
    {
      label: "Badges Earned",
      value: statistics.badgesEarned,
      icon: Award,
      color: "bg-indigo-500",
      bgColor: "bg-indigo-50",
      textColor: "text-indigo-700",
    },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Statistics</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;

          return (
            <div
              key={index}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-6 h-6 ${stat.textColor}`} />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-600">
                  {stat.label}
                </p>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
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
      <div className="mt-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-md p-6 text-white">
        <h3 className="text-lg font-semibold mb-2">Engagement Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm opacity-90">Total Activity</p>
            <p className="text-2xl font-bold">
              {statistics.confessionsPosted + statistics.reactionsGiven}
            </p>
          </div>
          <div>
            <p className="text-sm opacity-90">Engagement Rate</p>
            <p className="text-2xl font-bold">
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
            <p className="text-sm opacity-90">Avg Views/Post</p>
            <p className="text-2xl font-bold">
              {statistics.confessionsPosted > 0
                ? Math.round(
                    statistics.totalViews / statistics.confessionsPosted
                  )
                : 0}
            </p>
          </div>
          <div>
            <p className="text-sm opacity-90">Community Score</p>
            <p className="text-2xl font-bold">
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
