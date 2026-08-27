function SkeletonPill({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-[var(--skeleton)] ${className}`} />;
}

export const SkeletonCard = () => (
  <div className="luxury-panel animate-pulse rounded-[30px] p-6 border border-[var(--border)] bg-[var(--surface)]">
    <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-[var(--skeleton)]" />
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-[var(--skeleton)]" />
          <div className="h-3 w-20 rounded bg-[var(--accent-soft)]" />
        </div>
      </div>
      <div className="h-3 w-16 rounded bg-[var(--skeleton)]" />
    </div>

    <div className="mb-6 space-y-3">
      <div className="h-4 w-24 rounded-full bg-[var(--accent-soft)]" />
      <div className="h-7 w-full rounded bg-[var(--skeleton)]" />
      <div className="h-7 w-full rounded bg-[var(--skeleton)]" />
      <div className="h-7 w-3/4 rounded bg-[var(--skeleton)]" />
    </div>

    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <SkeletonPill className="h-10 w-16" />
        <SkeletonPill className="h-10 w-16" />
      </div>
      <div className="flex gap-2">
        <SkeletonPill className="h-10 w-20" />
        <SkeletonPill className="h-10 w-20" />
        <SkeletonPill className="h-10 w-20" />
      </div>
    </div>
  </div>
);

export function ConfessionFeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="space-y-5"
      role="status"
      aria-live="polite"
      aria-label="Loading confessions"
    >
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={`confession-skeleton-${index}`} />
      ))}
    </div>
  );
}

export function CommentSectionSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-label="Loading comments"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`comment-skeleton-${index}`}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="h-4 w-28 animate-pulse rounded bg-[var(--skeleton)]" />
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--skeleton)]" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-[var(--skeleton)]" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--skeleton)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConfessionDetailSkeleton() {
  return (
    <div
      className="space-y-8"
      role="status"
      aria-live="polite"
      aria-label="Loading confession details"
    >
      <div className="h-8 w-32 animate-pulse rounded bg-[var(--skeleton)]" />
      <SkeletonCard />
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="mb-4 h-5 w-40 animate-pulse rounded bg-[var(--skeleton)]" />
        <CommentSectionSkeleton />
      </div>
    </div>
  );
}

export function SearchResultsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-label="Loading search results"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`search-skeleton-${index}`}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div className="space-y-2 mb-3">
            <div className="h-4 w-full animate-pulse rounded bg-[var(--skeleton)]" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--skeleton)]" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--skeleton)]" />
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--skeleton)]" />
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--skeleton)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfilePageSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6"
      role="status"
      aria-live="polite"
      aria-label="Loading profile"
    >
      <div className="h-32 animate-pulse rounded-lg bg-[var(--surface)] border border-[var(--border)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-lg bg-[var(--surface)] border border-[var(--border)]"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-lg bg-[var(--surface)] border border-[var(--border)]" />
    </div>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-live="polite"
      aria-label="Loading admin dashboard"
    >
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-[var(--skeleton)]" />
        <div className="h-4 w-72 animate-pulse rounded bg-[var(--skeleton)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="h-64 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}