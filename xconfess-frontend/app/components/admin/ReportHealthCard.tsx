'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi, ReportStats } from '@/app/lib/api/admin';
import { queryKeys } from '@/app/lib/api/queryKeys';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

function formatAge(seconds: number | null): string {
  if (seconds === null) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function ReportHealthCard() {
  const { data: stats, isLoading, isError } = useQuery<ReportStats>({
    queryKey: queryKeys.admin.reports.stats(),
    queryFn: () => adminApi.getReportStats(),
    refetchInterval: 60000,
  });

  if (isError) {
    return (
      <div className="luxury-panel overflow-hidden rounded-[24px]">
        <div className="p-5">
          <h3 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
            Report Queue Health
          </h3>
          <p className="text-sm text-red-600">Report stats unavailable.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="luxury-panel overflow-hidden rounded-[24px]">
      <div className="p-5">
        <h3 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
          Report Queue Health
        </h3>
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-8 w-24 rounded bg-[var(--skeleton)]" />
            <div className="h-8 w-32 rounded bg-[var(--skeleton)]" />
            <div className="h-8 w-20 rounded bg-[var(--skeleton)]" />
          </div>
        ) : stats ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[var(--secondary)]">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Pending</span>
              </div>
              <span className="text-lg font-semibold text-[var(--foreground)]">
                {stats.pendingCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[var(--secondary)]">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Oldest unresolved</span>
              </div>
              <span className="font-semibold text-[var(--foreground)]">
                {formatAge(stats.oldestUnresolvedAge)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[var(--secondary)]">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">Resolved today</span>
              </div>
              <span className="text-lg font-semibold text-[var(--foreground)]">
                {stats.resolvedTodayCount}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--secondary)]">
            No report data available.
          </p>
        )}
      </div>
    </div>
  );
}
