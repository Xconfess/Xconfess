"use client";

import dynamic from 'next/dynamic';
import React, { useState, useEffect } from 'react';
import ErrorState from '@/app/components/common/ErrorState';
import { MetricsCard } from '@/app/components/analytics/MetricsCard';
import { TimePeriodSelector } from '@/app/components/analytics/TimePeriodSelector';
import { AUTH_TOKEN_KEY } from '@/app/lib/api/constants';
import {
    MessageSquare,
    Users,
    Heart,
    Activity,
    TrendingUp
} from 'lucide-react';

const ActivityChart = dynamic(
    () => import('@/app/components/analytics/ActivityChart').then(mod => mod.ActivityChart),
    { loading: () => <div className="animate-pulse bg-zinc-900 rounded-lg p-6 h-80"></div> }
);

const ReactionDistribution = dynamic(
    () => import('@/app/components/analytics/ReactionDistribution').then(mod => mod.ReactionDistribution),
    { loading: () => <div className="animate-pulse bg-zinc-900 rounded-lg p-6 h-80"></div> }
);

const TrendingConfessions = dynamic(
    () => import('@/app/components/analytics/TrendingConfessions').then(mod => mod.TrendingConfessions),
    { loading: () => <div className="animate-pulse bg-zinc-900 rounded-lg p-6 h-96"></div> }
);

interface AnalyticsData {
    comparison: {
        enabled: boolean;
        availability: 'available' | 'estimated' | 'unavailable';
        source: 'backend' | 'estimated' | 'none';
        note?: string;
    };
    metrics: {
        totalConfessions: number;
        totalUsers: number;
        totalReactions: number;
        activeUsers: number;
        confessionsDelta: {
            percentage: number | null;
            direction: 'up' | 'down' | 'flat' | 'unknown';
            availability: 'available' | 'estimated' | 'unavailable';
            note?: string;
        };
        usersDelta: {
            percentage: number | null;
            direction: 'up' | 'down' | 'flat' | 'unknown';
            availability: 'available' | 'estimated' | 'unavailable';
            note?: string;
        };
        reactionsDelta: {
            percentage: number | null;
            direction: 'up' | 'down' | 'flat' | 'unknown';
            availability: 'available' | 'estimated' | 'unavailable';
            note?: string;
        };
        activeDelta: {
            percentage: number | null;
            direction: 'up' | 'down' | 'flat' | 'unknown';
            availability: 'available' | 'estimated' | 'unavailable';
            note?: string;
        };
    };
    trendingConfessions: Array<{
        id: string;
        message: string;
        category?: string;
        reactions: any;
        viewCount: number;
        createdAt: string;
    }>;
    reactionDistribution: Array<{
        name: string;
        value: number;
        color: string;
    }>;
    activityData: Array<{
        date: string;
        confessions: number;
        users: number;
        reactions: number;
        previousConfessions?: number | null;
        previousReactions?: number | null;
    }>;
}

export default function AnalyticsPage() {
    const [period, setPeriod] = useState<'7d' | '30d'>('7d');
    const [comparisonEnabled, setComparisonEnabled] = useState(false);
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                setLoading(true);
                setError(null);

                const token = localStorage.getItem(AUTH_TOKEN_KEY);
                const compare = comparisonEnabled ? 'previous' : 'none';
                const response = await fetch(`/api/analytics?period=${period}&compare=${compare}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch analytics data');
                }

                const analyticsData = await response.json();
                setData(analyticsData);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, [period, comparisonEnabled, refreshKey]);

    const comparisonNote = comparisonEnabled ? (data?.comparison?.note ?? null) : null;

    return (
        <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 flex items-center gap-3">
                            <TrendingUp className="w-8 h-8 text-blue-500" />
                            Analytics Dashboard
                        </h1>
                        <p className="text-zinc-400">
                            Platform insights and trending confessions
                        </p>
                    </div>

                    <TimePeriodSelector
                        selected={period}
                        onChange={setPeriod}
                        comparisonEnabled={comparisonEnabled}
                        onComparisonChange={setComparisonEnabled}
                        comparisonNote={comparisonNote}
                    />
                </div>

                {/* Error State */}
                {error && (
                    <div className="mb-6">
                        <ErrorState
                            title="Error loading analytics"
                            error={error}
                            onRetry={async () => { setRefreshKey(prev => prev + 1); }}
                            fullHeight={false}
                        />
                    </div>
                )}

                {/* Comparison state message */}
                {comparisonEnabled && !loading && data?.comparison?.availability !== 'available' && (
                    <div
                        className={`mb-6 rounded-xl border px-4 py-3 text-sm ${data?.comparison?.availability === 'estimated'
                            ? 'border-amber-700/70 bg-amber-950/20 text-amber-200'
                            : 'border-zinc-700 bg-zinc-900/60 text-zinc-300'
                            }`}
                        role="status"
                    >
                        {data?.comparison?.note ?? 'Comparison data is currently unavailable for this selection.'}
                    </div>
                )}

                {/* Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                    <MetricsCard
                        title="Total Confessions"
                        value={data?.metrics?.totalConfessions ?? 0}
                        delta={data?.metrics?.confessionsDelta}
                        icon={MessageSquare}
                        color="text-blue-500"
                        loading={loading}
                        comparisonEnabled={comparisonEnabled}
                    />
                    <MetricsCard
                        title="Total Users"
                        value={data?.metrics?.totalUsers ?? 0}
                        delta={data?.metrics?.usersDelta}
                        icon={Users}
                        color="text-emerald-500"
                        loading={loading}
                        comparisonEnabled={comparisonEnabled}
                    />
                    <MetricsCard
                        title="Total Reactions"
                        value={data?.metrics?.totalReactions ?? 0}
                        delta={data?.metrics?.reactionsDelta}
                        icon={Heart}
                        color="text-rose-500"
                        loading={loading}
                        comparisonEnabled={comparisonEnabled}
                    />
                    <MetricsCard
                        title="Active Users"
                        value={data?.metrics?.activeUsers ?? 0}
                        delta={data?.metrics?.activeDelta}
                        icon={Activity}
                        color="text-purple-500"
                        loading={loading}
                        comparisonEnabled={comparisonEnabled}
                    />
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="lg:col-span-2">
                        <ActivityChart
                            data={data?.activityData ?? []}
                            loading={loading}
                            comparisonEnabled={comparisonEnabled}
                            comparisonAvailability={data?.comparison?.availability ?? 'unavailable'}
                            comparisonNote={data?.comparison?.note}
                            confessionsDelta={data?.metrics?.confessionsDelta}
                            reactionsDelta={data?.metrics?.reactionsDelta}
                        />
                    </div>
                    <div>
                        <ReactionDistribution
                            data={data?.reactionDistribution ?? []}
                            loading={loading}
                        />
                    </div>
                </div>

                {/* Trending Confessions */}
                <TrendingConfessions
                    confessions={(data?.trendingConfessions ?? []).map((item: any) => ({
                        ...item,
                        content: item.content ?? item.message,
                    }))}
                    loading={loading}
                />
            </div>
        </div>
    );
}