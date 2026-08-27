'use client';

import React from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Line,
} from 'recharts';
import { Activity, TrendingDown, TrendingUp, Minus } from 'lucide-react';

type ComparisonAvailability = 'available' | 'estimated' | 'unavailable';
type DeltaDirection = 'up' | 'down' | 'flat' | 'unknown';

interface MetricDelta {
  percentage: number | null;
  direction: DeltaDirection;
  availability: ComparisonAvailability;
  note?: string;
}

interface ActivityDataPoint {
  date: string;
  confessions: number;
  reactions: number;
  previousConfessions?: number | null;
  previousReactions?: number | null;
}

interface ActivityChartProps {
  data: ActivityDataPoint[];
  loading?: boolean;
  comparisonEnabled?: boolean;
  comparisonAvailability?: ComparisonAvailability;
  comparisonNote?: string;
  confessionsDelta?: MetricDelta;
  reactionsDelta?: MetricDelta;
}

function computeSeriesDelta(
  currentValues: number[],
  previousValues: Array<number | null | undefined>,
): number | null {
  const previous = previousValues
    .map((value) => (typeof value === 'number' ? value : null))
    .filter((value): value is number => value !== null);
  if (previous.length === 0) return null;
  const currentTotal = currentValues.reduce((sum, value) => sum + value, 0);
  const previousTotal = previous.reduce((sum, value) => sum + value, 0);
  if (previousTotal <= 0) return null;
  return Number((((currentTotal - previousTotal) / previousTotal) * 100).toFixed(1));
}

function normalizeDelta(
  provided: MetricDelta | undefined,
  computed: number | null,
): MetricDelta | undefined {
  if (provided) return provided;
  if (computed === null) return undefined;
  return {
    percentage: computed,
    direction: computed > 0 ? 'up' : computed < 0 ? 'down' : 'flat',
    availability: 'available',
  };
}

function DeltaBadge({
  label,
  delta,
}: {
  label: string;
  delta?: MetricDelta;
}) {
  if (!delta) return null;

  if (delta.availability === 'unavailable') {
    return (
      <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-zinc-800 text-zinc-400" title={delta.note}>
        {label}: No baseline
      </span>
    );
  }

  const value = delta.percentage ?? 0;
  const positive = value > 0;
  const negative = value < 0;
  const DeltaIcon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${
        positive
          ? 'bg-emerald-500/10 text-emerald-400'
          : negative
            ? 'bg-rose-500/10 text-rose-400'
            : 'bg-amber-500/10 text-amber-400'
      }`}
      title={delta.note}
    >
      <span>{label}</span>
      <DeltaIcon className="w-3.5 h-3.5" />
      <span>
        {delta.availability === 'estimated' ? '~' : ''}
        {positive ? '+' : ''}
        {value.toFixed(1)}%
      </span>
    </span>
  );
}

export const ActivityChart: React.FC<ActivityChartProps> = ({
  data,
  loading = false,
  comparisonEnabled = false,
  comparisonAvailability = 'unavailable',
  comparisonNote,
  confessionsDelta,
  reactionsDelta,
}) => {
  if (loading) {
    return (
      <div role='status' aria-label='loading' className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 h-[400px] flex items-center justify-center animate-pulse">
        <div className="w-full h-full bg-zinc-800/30 rounded-xl" />
      </div>
    );
  }

  const chartData = data.map(item => ({
    ...item,
    date: new Date(item.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }));

  const hasComparisonSeries =
    comparisonEnabled &&
    chartData.some(
      (point) =>
        typeof point.previousConfessions === 'number' ||
        typeof point.previousReactions === 'number',
    );

  const derivedConfessionsDelta = computeSeriesDelta(
    chartData.map((item) => item.confessions),
    chartData.map((item) => item.previousConfessions),
  );
  const derivedReactionsDelta = computeSeriesDelta(
    chartData.map((item) => item.reactions),
    chartData.map((item) => item.previousReactions),
  );

  const resolvedConfessionsDelta = normalizeDelta(confessionsDelta, derivedConfessionsDelta);
  const resolvedReactionsDelta = normalizeDelta(reactionsDelta, derivedReactionsDelta);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 h-[400px]">
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-purple-500" />
            <h3 className="text-xl font-bold text-white">Platform Activity</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {comparisonEnabled && (
              <>
                <DeltaBadge label="Confessions" delta={resolvedConfessionsDelta} />
                <DeltaBadge label="Reactions" delta={resolvedReactionsDelta} />
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-zinc-400">Confessions</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-400">Reactions</span>
          </div>
          {hasComparisonSeries && (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 border-t border-dashed border-blue-400" />
                <span className="text-xs text-zinc-400">Previous confessions</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 border-t border-dashed border-emerald-400" />
                <span className="text-xs text-zinc-400">Previous reactions</span>
              </div>
            </>
          )}
        </div>
        {comparisonEnabled && !hasComparisonSeries && (
          <p
            className={`text-xs ${
              comparisonAvailability === 'estimated'
                ? 'text-amber-400'
                : comparisonAvailability === 'available'
                  ? 'text-emerald-400'
                  : 'text-zinc-500'
            }`}
          >
            {comparisonNote || 'Comparison baseline is unavailable for this chart window.'}
          </p>
        )}
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorConfessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorReactions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#71717a', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#71717a', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                color: '#fff',
              }}
              itemStyle={{ color: '#fff' }}
            />
            <Area
              type="monotone"
              dataKey="confessions"
              stroke="#3b82f6"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorConfessions)"
            />
            <Area
              type="monotone"
              dataKey="reactions"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorReactions)"
            />
            {hasComparisonSeries && (
              <>
                <Line
                  type="monotone"
                  dataKey="previousConfessions"
                  stroke="#93c5fd"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="previousReactions"
                  stroke="#6ee7b7"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
