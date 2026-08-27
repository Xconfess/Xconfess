"use client";

import { TrendingConfession } from "@/app/lib/types/analytics.types";
import { Heart, ThumbsUp, Flame, TrendingUp } from "lucide-react";

interface Props {
  confession: TrendingConfession;
  rank: number;
}

export const TrendingConfessionCard = ({ confession, rank }: Props) => {
  const getRankColor = (rank: number) => {
    if (rank === 1) return 'from-yellow-500 to-orange-500';
    if (rank === 2) return 'from-gray-400 to-gray-500';
    if (rank === 3) return 'from-amber-600 to-amber-700';
    return 'from-purple-500 to-blue-500';
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const getFlameCount = (rank: number) => {
    if (rank === 1) return 3;
    if (rank === 2) return 2;
    if (rank === 3) return 1;
    return 0;
  };

  const createdAt = new Date(confession.createdAt);
  const formattedDate = Number.isNaN(createdAt.getTime())
    ? "Unknown date"
    : createdAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-5 hover:border-orange-500/50 transition-all">
      <div className="flex gap-4">
        {/* Rank Badge */}
        <div className={`flex-shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br ${getRankColor(rank)} flex items-center justify-center font-bold text-white text-lg`}>
          {getRankEmoji(rank)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-lg mb-3">{confession.content}</p>

          <div className="flex items-center gap-4 text-sm flex-wrap">
            {/* Flame indicators for top 3 */}
            {getFlameCount(rank) > 0 && (
              <span className="flex items-center gap-0.5 text-orange-400">
                {Array.from({ length: getFlameCount(rank) }).map((_, i) => (
                  <Flame key={i} className="w-4 h-4 fill-orange-400" />
                ))}
              </span>
            )}

            {/* Reactions */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-blue-400">
                <ThumbsUp className="w-4 h-4" />
                {confession.reactions.like}
              </span>
              <span className="flex items-center gap-1 text-pink-400">
                <Heart className="w-4 h-4" />
                {confession.reactions.love}
              </span>
            </div>

            {/* Total */}
            <div className="flex items-center gap-1 text-purple-400 font-semibold">
              <TrendingUp className="w-4 h-4" />
              {confession.reactionCount} total
            </div>

            {/* Date */}
            <span className="text-gray-500 ml-auto">
              {formattedDate}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};