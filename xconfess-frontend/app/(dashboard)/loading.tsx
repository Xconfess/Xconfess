import { ConfessionFeedSkeleton } from '@/app/components/confession/LoadingSkeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-28 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800"
          />
        ))}
      </div>
      <ConfessionFeedSkeleton count={3} />
    </div>
  );
}
