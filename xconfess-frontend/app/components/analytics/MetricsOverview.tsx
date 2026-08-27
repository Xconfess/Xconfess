"use client";

import { MessageSquare, Heart, Users } from "lucide-react";

interface Props {
  metrics: {
    totalConfessions: number;
    totalReactions: number;
    totalUsers: number;
  };
  period: '24h' | '7days' | '30days' | 'all';
}

export const MetricsOverview = ({ metrics, period }: Props) => {
  const cards = [
    {
      label: 'Total Confessions',
      value: metrics.totalConfessions,
      icon: MessageSquare,
      color: 'from-purple-500 to-blue-500',
      textColor: 'text-purple-400'
    },
    {
      label: 'Total Reactions',
      value: metrics.totalReactions,
      icon: Heart,
      color: 'from-pink-500 to-rose-500',
      textColor: 'text-pink-400'
    },
    {
      label: 'Active Users',
      value: metrics.totalUsers,
      icon: Users,
      color: 'from-blue-500 to-cyan-500',
      textColor: 'text-blue-400'
    }
  ];

  const periodLabel =
    period === '24h'
      ? 'Last 24 Hours'
      : period === '7days'
        ? 'Last 7 Days'
        : period === '30days'
          ? 'Last 30 Days'
          : 'All Time';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className={`text-4xl font-bold mb-2 ${card.textColor}`}>
              {card.value.toLocaleString()}
            </div>
            <div className="text-gray-400 text-sm">{card.label}</div>
            <div className="text-gray-500 text-xs mt-1">{periodLabel}</div>
          </div>
        );
      })}
    </div>
  );
};
