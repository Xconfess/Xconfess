import React from 'react';
import { LucideIcon, TrendingDown, TrendingUp, Minus } from 'lucide-react';

type ComparisonAvailability = 'available' | 'estimated' | 'unavailable';
type DeltaDirection = 'up' | 'down' | 'flat' | 'unknown';

interface MetricDelta {
    percentage: number | null;
    direction: DeltaDirection;
    availability: ComparisonAvailability;
    note?: string;
}

interface MetricsCardProps {
    title: string;
    value: string | number;
    change?: number;
    delta?: MetricDelta;
    icon: LucideIcon;
    color: string;
    loading?: boolean;
    comparisonEnabled?: boolean;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
    title,
    value,
    change,
    delta,
    icon: Icon,
    color,
    loading = false,
    comparisonEnabled = false,
}) => {
    if (loading) {
        return (
            <div role='status' aria-label='loading' className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 animate-pulse">
                <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-zinc-800 rounded-xl" />
                    <div className="w-16 h-4 bg-zinc-800 rounded" />
                </div>
                <div className="w-24 h-8 bg-zinc-800 rounded mb-2" />
                <div className="w-32 h-4 bg-zinc-800 rounded" />
            </div>
        );
    }

    const normalizedDelta: MetricDelta | undefined = delta
        ? delta
        : change !== undefined
            ? {
                percentage: change,
                direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
                availability: 'available',
            }
            : undefined;

    const deltaValue = normalizedDelta?.percentage;
    const isPositive = (deltaValue ?? 0) > 0;
    const isNegative = (deltaValue ?? 0) < 0;
    const isUnavailable = normalizedDelta?.availability === 'unavailable';

    const DeltaIcon = normalizedDelta?.direction === 'down'
        ? TrendingDown
        : normalizedDelta?.direction === 'flat'
            ? Minus
            : TrendingUp;

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 transition-all hover:border-zinc-700 group">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2.5 rounded-xl ${color} bg-opacity-10 text-opacity-100 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6" />
                </div>
                {normalizedDelta && (
                    <div
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${isUnavailable
                            ? 'bg-zinc-800 text-zinc-400'
                            : isPositive
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : isNegative
                                    ? 'bg-rose-500/10 text-rose-500'
                                    : 'bg-amber-500/10 text-amber-400'
                            }`}
                        title={normalizedDelta.note}
                    >
                        {isUnavailable ? (
                            <span>No baseline</span>
                        ) : (
                            <>
                                <DeltaIcon className="w-3.5 h-3.5" />
                                <span>
                                    {normalizedDelta.availability === 'estimated' ? '~' : ''}
                                    {isPositive ? '+' : ''}
                                    {deltaValue?.toFixed(1)}%
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>
            <h3 className="text-zinc-400 text-sm font-medium mb-1">{title}</h3>
            <div className="text-3xl font-bold text-white tracking-tight">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {comparisonEnabled && normalizedDelta?.note && (
                <p className="text-[11px] text-zinc-500 mt-2">{normalizedDelta.note}</p>
            )}
        </div>
    );
};
