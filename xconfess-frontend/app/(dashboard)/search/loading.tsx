import { SearchResultsSkeleton } from '@/app/components/confession/LoadingSkeleton';

export default function SearchLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="h-12 w-full animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <SearchResultsSkeleton count={4} />
    </div>
  );
}
