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
            <div className="bg-[var(--surface)]/50 border border-[var(--border)] rounded-2xl p-6">
                <h3 className="text-xl font-semibold text-[var(--foreground)] mb-6">Trending Confessions</h3>
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="bg-[var(--surface-muted)]/30 rounded-xl p-4 animate-pulse">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-[var(--surface-elevated)] rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-[var(--surface-elevated)] rounded w-3/4" />
                                    <div className="h-4 bg-[var(--surface-elevated)] rounded w-1/2" />
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
        <div className="bg-[var(--surface)]/50 border border-[var(--border)] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[var(--foreground)]">🔥 Trending Confessions</h3>
                <span className="text-xs text-[var(--text-muted)]">Top 10 by engagement</span>
            </div>

            <div className="space-y-3">
                {confessions.slice(0, 10).map((confession, index) => (
                    <div
                        key={confession.id}
                        data-testid={`confession-card-${confession.id || index + 1}`}
                        className="group bg-[var(--surface-muted)]/30 hover:bg-[var(--surface-muted)]/50 rounded-xl p-4 transition-all cursor-pointer border border-transparent hover:border-[var(--border)]"
                    >
                        <div className="flex items-start gap-3">
                            {/* Rank Badge */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm ${index === 0 ? 'bg-[var(--surface)]   text-[var(--foreground)]' :
                                index === 1 ? 'bg-[var(--surface)]   text-[var(--foreground)]' :
                                    index === 2 ? 'bg-[var(--surface)]   text-[var(--foreground)]' :
                                        'bg-[var(--surface-elevated)]/50 text-[var(--text-muted)]'
                                }`}>
                                {index + 1}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[var(--secondary)] text-sm leading-relaxed line-clamp-2 mb-3 group-hover:text-[var(--foreground)] transition-colors">
                                    {confession.content}
                                </p>

                                {/* Category & Time */}
                                <div className="flex items-center gap-2 mb-3">
                                    {confession.category && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--primary-deep)] border border-[var(--accent-border)]">
                                            {confession.category}
                                        </span>
                                    )}
                                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {getTimeAgo(confession.createdAt)}
                                    </span>
                                </div>

                                {/* Stats */}
                                <div className="flex items-center gap-4 text-xs">
                                    <div className="flex items-center gap-1.5 text-[var(--danger)]">
                                        <Heart className="w-4 h-4 fill-[var(--danger)]" />
                                        <span className="font-medium">{getTotalReactions(confession)}</span>
                                    </div>
                                    {confession.viewCount !== undefined && (
                                        <div className="flex items-center gap-1.5 text-[var(--primary-deep)]">
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
                    <p className="text-[var(--text-muted)]">No trending confessions yet</p>
                </div>
            )}
        </div>
    );
};