"use client";

import React from 'react';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
} from 'recharts';

interface ReactionData {
    name: string;
    value: number;
    color: string;
}

interface ReactionDistributionProps {
    data: ReactionData[];
    loading?: boolean;
}

export const ReactionDistribution: React.FC<ReactionDistributionProps> = ({
    data,
    loading = false
}) => {
    if (loading) {
        return (
            <div role='status' aria-label='loading' className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 h-[400px] flex items-center justify-center animate-pulse">
                <div className="w-48 h-48 bg-zinc-800/30 rounded-full" />
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 h-[400px] flex flex-col">
            <h3 className="text-xl font-bold text-white mb-6">Reaction Distribution</h3>

            <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#18181b',
                                border: '1px solid #27272a',
                                borderRadius: '8px',
                                color: '#fff'
                            }}
                        />
                        <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => <span className="text-zinc-400 text-sm ml-2">{value}</span>}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
