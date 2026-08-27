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
            <div className="inline-flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-1">
                <button
                    onClick={() => onChange('7d')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${selected === '7d'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                        }`}
                    aria-label="Show 7 days data"
                >
                    7 Days
                </button>
                <button
                    onClick={() => onChange('30d')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer  ${selected === '30d'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                        }`}
                    aria-label="Show 30 days data"
                >
                    30 Days
                </button>
                <span className="h-6 w-px bg-zinc-800" />
                <button
                    type="button"
                    role="switch"
                    aria-checked={comparisonEnabled}
                    onClick={() => onComparisonChange?.(!comparisonEnabled)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${comparisonEnabled
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-zinc-400 border border-zinc-800 hover:text-white hover:bg-zinc-800/50'
                        }`}
                    aria-label="Toggle comparison mode"
                >
                    <span
                        className={`h-1.5 w-1.5 rounded-full ${comparisonEnabled ? 'bg-emerald-300' : 'bg-zinc-500'
                            }`}
                    />
                    Compare
                </button>
            </div>
            {comparisonNote && (
                <p className="text-xs text-zinc-500 max-w-[22rem]">{comparisonNote}</p>
            )}
        </div>
    );
};
