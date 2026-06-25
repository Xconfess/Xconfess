'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useComparison } from '@/app/lib/api/comparison';
import { useComparisonStore } from '@/app/lib/store/comparisonStore';
import { ComparisonTable } from './ComparisonTable';
import { Button } from '@/app/components/ui/button';
import { Share2, RefreshCw } from 'lucide-react';
import { useGlobalToast } from '@/app/components/common/Toast';

export function ComparisonTool() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');
  const itemIds = idsParam ? idsParam.split(',').filter(Boolean) : [];
  const { data, isLoading, isFetching, error, refetch } = useComparison(itemIds);
  const { clearItems } = useComparisonStore();
  const toast = useGlobalToast();

  useEffect(() => {
    // Clear selection when component mounts (after navigation)
    clearItems();
  }, [clearItems]);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Comparison link copied to clipboard.');
  };

  const showEmptySelection = itemIds.length === 0;
  const hasLoadedData = !!data && data.items.length > 0;
  const comparisonData = data || { items: [], metrics: [] };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Confession Comparison</h2>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Compare confession metrics side by side. Use the share link once you have a selection.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleShare} disabled={itemIds.length === 0}>
            <Share2 className="h-4 w-4 mr-2" />
            Share Comparison
          </Button>
          {error && (
            <Button variant="outline" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 min-h-[320px]">
        {isLoading || isFetching ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400">
            <div className="h-4 w-48 rounded-full bg-zinc-800 animate-pulse" />
            <div className="h-3 w-36 rounded-full bg-zinc-800 animate-pulse" />
            <div className="mt-10 grid w-full gap-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-16 rounded-2xl bg-zinc-900" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-red-300">
            <p className="text-lg font-semibold">Unable to load comparison data</p>
            <p className="max-w-xl text-sm text-zinc-400">
              A network or server error occurred while loading the selected confessions. Please try again.
            </p>
            <Button onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : showEmptySelection ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-400">
            <p className="text-lg font-semibold text-white">No confessions selected for comparison.</p>
            <p className="max-w-xl text-sm">
              Select two or more confessions from the feed and use the comparison link to compare engagement side by side.
            </p>
          </div>
        ) : !hasLoadedData ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-400">
            <p className="text-lg font-semibold text-white">Comparison data is unavailable.</p>
            <p className="max-w-xl text-sm">
              The selected confessions do not contain comparable metrics. Try a different selection or refresh.
            </p>
          </div>
        ) : (
          <ComparisonTable data={comparisonData} />
        )}
      </div>
    </div>
  );
}
