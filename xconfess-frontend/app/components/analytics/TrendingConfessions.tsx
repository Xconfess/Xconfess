"use client";

import React from 'react';
import { Clock, Heart, Eye } from 'lucide-react';

import { Confession } from "@/app/lib/types/confession";

interface TrendingConfessionsProps {
    confessions: Confession[];
    loading?: boolean;
}

export const TrendingConfessions: React.FC<TrendingConfessionsProps> = ({
    confessions,
    loading = false
}) => {
    if (loading) {
        return (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-6">Trending Confessions</h3>
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="bg-zinc-800/30 rounded-xl p-4 animate-pulse">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-zinc-700 rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-zinc-700 rounded w-3/4" />
                                    <div className="h-4 bg-zinc-700 rounded w-1/2" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const getTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        // Fallback to current time or a safe default if the date is invalid
        const validDate = isNaN(date.getTime()) ? new Date() : date;

        const now = new Date();
        const diffInHours = Math.floor((now.getTime() - validDate.getTime()) / (1000 * 60 * 60));

        if (diffInHours < 1) return 'Just now';
        if (diffInHours < 24) return `${diffInHours}h ago`;
        const days = Math.floor(diffInHours / 24);
        if (days < 7) return `${days}d ago`;
        return `${Math.floor(days / 7)}w ago`;
    };

    const getTotalReactions = (confession: Confession) => {
        if (typeof confession.reactions === 'number') return confession.reactions;
        if (confession.reactionCount !== undefined) return confession.reactionCount;
        return Object.values(confession.reactions).reduce((sum, val) => sum + (val || 0), 0);
    };

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">🔥 Trending Confessions</h3>
                <span className="text-xs text-zinc-500">Top 10 by engagement</span>
            </div>

            <div className="space-y-3">
                {confessions.slice(0, 10).map((confession, index) => (
                    <div
                        key={confession.id}
                        data-testid={`confession-card-${confession.id || index + 1}`}
                        className="group bg-zinc-800/30 hover:bg-zinc-800/50 rounded-xl p-4 transition-all cursor-pointer border border-transparent hover:border-zinc-700"
                    >
                        <div className="flex items-start gap-3">
                            {/* Rank Badge */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${index === 0 ? 'bg-linear-to-br from-yellow-500 to-orange-500 text-white' :
                                index === 1 ? 'bg-linear-to-br from-gray-400 to-gray-500 text-white' :
                                    index === 2 ? 'bg-linear-to-br from-orange-600 to-orange-700 text-white' :
                                        'bg-zinc-700/50 text-zinc-400'
                                }`}>
                                {index + 1}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <p className="text-zinc-300 text-sm leading-relaxed line-clamp-2 mb-3 group-hover:text-white transition-colors">
                                    {confession.content}
                                </p>

                                {/* Category & Time */}
                                <div className="flex items-center gap-2 mb-3">
                                    {confession.category && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                            {confession.category}
                                        </span>
                                    )}
                                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {getTimeAgo(confession.createdAt)}
                                    </span>
                                </div>

                                {/* Stats */}
                                <div className="flex items-center gap-4 text-xs">
                                    <div className="flex items-center gap-1.5 text-rose-400">
                                        <Heart className="w-4 h-4 fill-rose-400" />
                                        <span className="font-medium">{getTotalReactions(confession)}</span>
                                    </div>
                                    {confession.viewCount !== undefined && (
                                        <div className="flex items-center gap-1.5 text-blue-400">
                                            <Eye className="w-4 h-4" />
                                            <span className="font-medium">{confession.viewCount.toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {confessions.length === 0 && !loading && (
                <div className="text-center py-12">
                    <p className="text-zinc-500">No trending confessions yet</p>
                </div>
            )}
        </div>
    );
};