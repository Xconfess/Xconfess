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
            <div role='status' aria-label='loading' className="bg-[var(--surface)]/50 border border-[var(--border)] rounded-2xl p-6 animate-pulse">
                <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-[var(--surface-muted)] rounded-xl" />
                    <div className="w-16 h-4 bg-[var(--surface-muted)] rounded" />
                </div>
                <div className="w-24 h-8 bg-[var(--surface-muted)] rounded mb-2" />
                <div className="w-32 h-4 bg-[var(--surface-muted)] rounded" />
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
        <div className="bg-[var(--surface)]/50 border border-[var(--border)] rounded-2xl p-6 transition-all hover:border-[var(--border)] group">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2.5 rounded-xl ${color} bg-opacity-10 text-opacity-100  transition-transform`}>
                    <Icon className="w-6 h-6" />
                </div>
                {normalizedDelta && (
                    <div
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${isUnavailable
                            ? 'bg-[var(--surface-muted)] text-[var(--text-muted)]'
                            : isPositive
                                ? 'bg-[var(--success)]/10 text-[var(--success)]'
                                : isNegative
                                    ? 'bg-[var(--danger)]/10 text-[var(--danger)]'
                                    : 'bg-[var(--warning)]/10 text-[var(--warning)]'
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
            <h3 className="text-[var(--text-muted)] text-sm font-medium mb-1">{title}</h3>
            <div className="text-3xl font-semibold text-[var(--foreground)] tracking-tight">
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {comparisonEnabled && normalizedDelta?.note && (
                <p className="text-[11px] text-[var(--text-muted)] mt-2">{normalizedDelta.note}</p>
            )}
        </div>
    );
};
