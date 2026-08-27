"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  AnalyticsData,
  DailyActivity,
  ReactionDistribution,
  TrendingConfession,
} from "@/app/lib/types/analytics.types";
import { TrendingConfessionCard } from "./TrendingConfessionCard";
import { ReactionChart } from "./ReactionChart";
import { ActivityChart } from "./ActivityChart";
import { MetricsOverview } from "./MetricsOverview";
import { AnalyticsLoadingSkeleton } from "./LoadingState";
import { TrendingUp, Calendar, Flame, Clock } from "lucide-react";

type AnalyticsApiResponse = Partial<AnalyticsData> & {
  generatedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeTrending(value: unknown): TrendingConfession[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((item, index) => {
      const reactions = isRecord(item.reactions) ? item.reactions : {};
      const like = asNumber(reactions.like);
      const love = asNumber(reactions.love);
      const reactionCount = asNumber(item.reactionCount, like + love);
      const content =
        typeof item.content === "string"
          ? item.content
          : typeof item.message === "string"
            ? item.message
            : "Untitled confession";

      return {
        id: typeof item.id === "string" ? item.id : `trending-${index}`,
        content,
        createdAt:
          typeof item.createdAt === "string"
            ? item.createdAt
            : new Date(0).toISOString(),
        reactionCount,
        reactions: { like, love },
      };
    });
}

function normalizeReactionDistribution(value: unknown): ReactionDistribution[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((item) => ({
    type: typeof item.type === "string" ? item.type : "unknown",
    count: asNumber(item.count),
    percentage: asNumber(item.percentage),
  }));
}

function normalizeDailyActivity(value: unknown): DailyActivity[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((item) => ({
    date: typeof item.date === "string" ? item.date : "",
    confessions: asNumber(item.confessions),
    reactions: asNumber(item.reactions),
    activeUsers: asNumber(item.activeUsers),
  }));
}

function normalizeAnalyticsData(
  payload: unknown,
  fallbackPeriod: "24h" | "7days" | "30days" | "all",
): AnalyticsData {
  const source: AnalyticsApiResponse = isRecord(payload) ? payload : {};
  const trending = normalizeTrending(source.trending);
  const reactionDistribution = normalizeReactionDistribution(
    source.reactionDistribution,
  );
  const dailyActivity = normalizeDailyActivity(source.dailyActivity);
  const metrics: Record<string, unknown> = isRecord(source.totalMetrics)
    ? source.totalMetrics
    : {};

  return {
    trending,
    reactionDistribution,
    dailyActivity,
    totalMetrics: {
      totalConfessions: asNumber(metrics.totalConfessions, trending.length),
      totalReactions: asNumber(
        metrics.totalReactions,
        trending.reduce((sum, item) => sum + item.reactionCount, 0),
      ),
      totalUsers: asNumber(metrics.totalUsers),
    },
    period:
      source.period === "24h" ||
      source.period === "30days" ||
      source.period === "7days" ||
      source.period === "all"
        ? source.period
        : fallbackPeriod,
  };
}

export const TrendingDashboard = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'24h' | '7days' | '30days' | 'all'>('24h');
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const AUTO_REFRESH_MS = 1000 * 60 * 5; // 5 minutes
  const STALE_MS = 1000 * 60 * 5;

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/confessions/trending/top?window=${period === '24h' ? '24h' : period === '7days' ? '7d' : period === '30days' ? '30d' : 'all'}`);

      if (!res.ok) throw new Error('Failed to fetch trending');

      const rawData = await res.json();
      const trendingPayload =
        isRecord(rawData) && Array.isArray(rawData.data) ? rawData.data : null;
      const analyticsData = trendingPayload
        ? {
          trending: normalizeTrending(trendingPayload),
          reactionDistribution: [],
          dailyActivity: [],
          totalMetrics: {
            totalConfessions: trendingPayload.length,
            totalReactions: normalizeTrending(trendingPayload).reduce(
              (sum, item) => sum + item.reactionCount,
              0,
            ),
            totalUsers: 0,
          },
          period,
        }
        : normalizeAnalyticsData(rawData, period);

      setData(analyticsData);

      const headerDate =
        typeof res.headers?.get === "function"
          ? res.headers.get("x-generated-at")
          : null;
      if (headerDate) {
        const ts = Date.parse(headerDate);
        if (!isNaN(ts)) setFetchedAt(ts);
      } else if (isRecord(rawData) && typeof rawData.generatedAt === "string") {
        const ts = Date.parse(rawData.generatedAt);
        if (!isNaN(ts)) setFetchedAt(ts);
      } else {
        setFetchedAt(Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trending');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      fetchAnalytics();
    }, AUTO_REFRESH_MS);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [fetchAnalytics]);

  const isStale = fetchedAt ? Date.now() - fetchedAt > STALE_MS : false;
  const showSkeleton = !data;
  const trending = data?.trending ?? [];
  const reactionDistribution = data?.reactionDistribution ?? [];
  const dailyActivity = data?.dailyActivity ?? [];
  const totalMetrics = data?.totalMetrics ?? {
    totalConfessions: 0,
    totalReactions: 0,
    totalUsers: 0,
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-purple-500" />
              Trending Dashboard
            </h1>
            <p className="text-gray-400">
              Discover the most popular confessions and platform insights
            </p>
            {fetchedAt && (
              <p className={`text-sm mt-2 ${isStale ? 'text-amber-400' : 'text-zinc-500'}`}>
                {isStale ? 'Stale data — consider refreshing' : `Last updated ${new Date(fetchedAt).toLocaleString()}`}
              </p>
            )}
          </div>

          {/* Period Selector */}
          <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div className="flex gap-1">
              <button
                onClick={() => setPeriod('24h')}
                className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${period === '24h'
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'
                  }`}
              >
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                24h
              </button>
              <button
                onClick={() => setPeriod('7days')}
                className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${period === '7days'
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'
                  }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setPeriod('30days')}
                className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${period === '30days'
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'
                  }`}
              >
                30 Days
              </button>
              <button
                onClick={() => setPeriod('all')}
                className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${period === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'
                  }`}
              >
                All Time
              </button>
            </div>
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Flame className="w-4 h-4 text-orange-400" />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="mb-6 rounded-xl border px-4 py-3 bg-red-900/20 border-red-800 text-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div>
              <strong className="mr-2">Failed to Load Analytics</strong>
              <span className="text-red-200">{error}</span>
            </div>
            <div>
              <button
                onClick={fetchAnalytics}
                disabled={loading}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white"
              >
                {loading ? "Retrying..." : "Retry"}
              </button>
            </div>
          </div>
        )}

        {/* Metrics Overview */}
        {showSkeleton ? (
          <AnalyticsLoadingSkeleton />
        ) : (
          <MetricsOverview metrics={totalMetrics} period={period} />
        )}

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {showSkeleton ? (
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 min-h-[320px]">
              <div className="h-6 w-48 bg-zinc-800 rounded-lg animate-pulse mb-6" />
              <div className="h-64 bg-zinc-800 rounded-lg animate-pulse" />
            </div>
          ) : (
            <ReactionChart data={reactionDistribution} />
          )}

          {showSkeleton ? (
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 min-h-[320px]">
              <div className="h-6 w-48 bg-zinc-800 rounded-lg animate-pulse mb-6" />
              <div className="h-64 bg-zinc-800 rounded-lg animate-pulse" />
            </div>
          ) : (
            <ActivityChart data={dailyActivity} />
          )}
        </div>

        {/* Trending Confessions */}
        <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 min-h-[220px]">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Flame className="w-7 h-7 text-orange-500" />
            Top Trending Confessions
            <span className="text-sm font-normal text-zinc-500 ml-2">
              {fetchedAt && (
                <span className={isStale ? 'text-amber-400' : 'text-zinc-500'}>
                  Auto-refreshes every 5 min
                </span>
              )}
            </span>
          </h2>

          <div className="space-y-4">
            {showSkeleton ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-zinc-800 rounded-xl p-5">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-zinc-700 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-3">
                      <div className="h-6 w-full bg-zinc-700 rounded-lg animate-pulse" />
                      <div className="h-4 w-3/4 bg-zinc-700 rounded-lg animate-pulse" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              trending.map((confession, index) => (
                <TrendingConfessionCard
                  key={confession.id}
                  confession={confession}
                  rank={index + 1}
                />
              ))
            )}
          </div>

          {!loading && data && trending.length === 0 && (
            <div className="text-center py-12" role="status" aria-live="polite">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300">
                <TrendingUp className="h-6 w-6" aria-hidden />
              </div>
              <p className="text-gray-200 font-medium">
                No trending confessions yet
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
                Try a different time period, refresh the dashboard, or seed demo
                data before a product walkthrough.
              </p>
              <button
                type="button"
                onClick={fetchAnalytics}
                className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Refresh trending
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
