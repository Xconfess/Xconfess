'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi, Analytics } from '@/app/lib/api/admin';
import { queryKeys } from '@/app/lib/api/queryKeys';
import AnalyticsDashboard from '@/app/components/admin/AnalyticsDashboard';
import ReportHealthCard from '@/app/components/admin/ReportHealthCard';
import { AnalyticsLoadingSkeleton } from '@/app/components/analytics/LoadingState';

export default function AdminDashboardPage() {
  const { data: analytics, isLoading } = useQuery<Analytics>({
    queryKey: queryKeys.admin.analytics.all(),
    queryFn: () => adminApi.getAnalytics(),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return <AnalyticsLoadingSkeleton />;
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Failed to load analytics</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--foreground)]">
          Platform health
        </h1>
      </div>
      <ReportHealthCard />
      <AnalyticsDashboard analytics={analytics} />
    </div>
  );
}
