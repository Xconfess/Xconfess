'use client';

import { ComparisonData } from '@/app/lib/types/comparison';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';

interface ComparisonTableProps {
  data: ComparisonData;
}

export function ComparisonTable({ data }: ComparisonTableProps) {
  const { items, metrics } = data;

  if (!items.length) {
    return (
      <Card className="p-6 text-center min-h-[240px] flex flex-col items-center justify-center gap-3 border-zinc-800 bg-zinc-950">
        <p className="text-lg font-semibold text-white">No items selected for comparison</p>
        <p className="max-w-xl text-sm text-zinc-400">
          Pick confessions from the feed and use the comparison link to compare engagement side by side.
        </p>
      </Card>
    );
  }

  if (!metrics.length) {
    return (
      <Card className="p-6 text-center min-h-[240px] flex flex-col items-center justify-center gap-3 border-zinc-800 bg-zinc-950">
        <p className="text-lg font-semibold text-white">Nothing to compare</p>
        <p className="max-w-xl text-sm text-zinc-400">
          The selected confessions do not have comparable metrics available.
        </p>
      </Card>
    );
  }

  // Safely extract values checking for date types or fallback safe numbers
  const parseMetricValue = (val: any): number => {
    if (!val && val !== 0) return 0;
    if (typeof val === 'string' && isNaN(Number(val)) && !isNaN(Date.parse(val))) {
      return new Date(val).getTime();
    }
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const getBestValue = (metric: string, values: any[]) => {
    const parsed = values.map(parseMetricValue);
    // If comparing creation dates, oldest or newest could be "best". Let's assume higher numbers (newer/more engagement) are preferred.
    return Math.max(...parsed);
  };

  // Precompute metrics records maps
  const bestValues = metrics.reduce((acc, metric) => {
    const values = items.map(item => item.metrics[metric]);
    acc[metric] = getBestValue(metric, values);
    return acc;
  }, {} as Record<string, number>);

  const isBest = (metric: string, value: any) => {
    return parseMetricValue(value) === bestValues[metric] && bestValues[metric] !== 0;
  };

  return (
    <Card className="overflow-x-auto min-h-[280px] border-zinc-800 bg-zinc-950 rounded-2xl">
      <table className="w-full border-separate border-spacing-0 table-fixed">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/40">
            {/* First column empty for Metric Labels */}
            <th className="p-4 text-left font-semibold text-zinc-400 text-xs uppercase tracking-wider w-48 border-b border-zinc-800">
              Analysis Metric
            </th>
            {/* Renders Confessions Side-by-Side as columns headers */}
            {items.map(item => (
              <th key={item.id} className="p-4 text-left font-bold text-white border-b border-zinc-800 border-l border-zinc-800/60 min-w-[280px]">
                <div className="flex flex-col gap-1">
                  <span className="truncate text-sm" title={item.name}>{item.name}</span>
                  {item.data?.category && (
                    <span className="text-[10px] font-mono font-normal text-zinc-500 max-w-max bg-zinc-900 px-2 py-0.5 rounded">
                      {item.data.category}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Confession Body Row */}
          <tr className="border-b border-zinc-800 hover:bg-zinc-900/10 transition-colors">
            <td className="p-4 align-top text-xs font-medium text-zinc-400 bg-zinc-900/20 border-b border-zinc-800">
              Confession Context
            </td>
            {items.map(item => (
              <td key={item.id} className="p-4 align-top border-b border-zinc-800 border-l border-zinc-800/60">
                <p className="text-xs text-zinc-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
                  {item.data?.content || "No context text provided."}
                </p>
              </td>
            ))}
          </tr>

          {/* Dynamic Metrics Side-By-Side Row Maps */}
          {metrics.map((metric) => (
            <tr key={metric} className="border-b border-zinc-800 hover:bg-zinc-900/20 transition-colors">
              <td className="p-4 align-middle text-xs font-semibold text-zinc-300 capitalize bg-zinc-900/20 border-b border-zinc-800">
                {metric.replace(/([A-Z])/g, ' $1').trim()}
              </td>
              {items.map(item => {
                const rawValue = item.metrics[metric];
                const best = isBest(metric, rawValue);
                
                // Human-readable date string output rendering checks
                const displayValue = (typeof rawValue === 'string' && !isNaN(Date.parse(rawValue)) && isNaN(Number(rawValue)))
                  ? new Date(rawValue).toLocaleDateString(undefined, { dateStyle: 'medium' })
                  : rawValue;

                return (
                  <td key={item.id} className="p-4 align-middle border-b border-zinc-800 border-l border-zinc-800/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className={best ? 'font-bold text-emerald-400 text-sm' : 'text-zinc-300 text-sm'}>
                        {displayValue}
                      </span>
                      {best && (
                        <Badge className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20 text-[10px] font-semibold py-0 px-2 rounded-full">
                          Highest
                        </Badge>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}