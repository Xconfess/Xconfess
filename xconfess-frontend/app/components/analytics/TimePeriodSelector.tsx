"use client";

import React from 'react';

interface TimePeriodSelectorProps {
    selected: '7d' | '30d';
    onChange: (period: '7d' | '30d') => void;
    comparisonEnabled?: boolean;
    onComparisonChange?: (enabled: boolean) => void;
    comparisonNote?: string | null;
}

export const TimePeriodSelector: React.FC<TimePeriodSelectorProps> = ({
    selected,
    onChange,
    comparisonEnabled = false,
    onComparisonChange,
    comparisonNote
}) => {
    return (
        <div className="inline-flex flex-col gap-2">
            <div className="inline-flex items-center gap-2 bg-[var(--surface)]/50 border border-[var(--border)] rounded-xl p-1">
                <button
                    onClick={() => onChange('7d')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${selected === '7d'
                        ? 'bg-[var(--primary)] text-white  shadow-blue-600/20'
                        : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--surface-muted)]/50'
                        }`}
                    aria-label="Show 7 days data"
                >
                    7 Days
                </button>
                <button
                    onClick={() => onChange('30d')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer  ${selected === '30d'
                        ? 'bg-[var(--primary)] text-white  shadow-blue-600/20'
                        : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--surface-muted)]/50'
                        }`}
                    aria-label="Show 30 days data"
                >
                    30 Days
                </button>
                <span className="h-6 w-px bg-[var(--surface-muted)]" />
                <button
                    type="button"
                    role="switch"
                    aria-checked={comparisonEnabled}
                    onClick={() => onComparisonChange?.(!comparisonEnabled)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${comparisonEnabled
                        ? 'bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/40'
                        : 'text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)]/50'
                        }`}
                    aria-label="Toggle comparison mode"
                >
                    <span
                        className={`h-1.5 w-1.5 rounded-full ${comparisonEnabled ? 'bg-[var(--success)]' : 'bg-[var(--text-muted)]'
                            }`}
                    />
                    Compare
                </button>
            </div>
            {comparisonNote && (
                <p className="text-xs text-[var(--text-muted)] max-w-[22rem]">{comparisonNote}</p>
            )}
        </div>
    );
};
