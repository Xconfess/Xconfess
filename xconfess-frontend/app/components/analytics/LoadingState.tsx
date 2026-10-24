export const AnalyticsLoadingSkeleton = () => {
  return (
    <div
      className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"
      role="status"
      aria-live="polite"
      aria-label="Loading analytics dashboard"
    >
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <p className="sr-only">Loading analytics...</p>
          <div className="h-10 w-64 bg-[var(--surface-muted)] rounded-lg animate-pulse mb-2" />
          <div className="h-5 w-96 bg-[var(--surface-muted)] rounded-lg animate-pulse" />
        </div>

        {/* Metrics skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <div className="w-12 h-12 bg-[var(--surface-muted)] rounded-lg animate-pulse mb-4" />
              <div className="h-10 w-24 bg-[var(--surface-muted)] rounded-lg animate-pulse mb-2" />
              <div className="h-4 w-32 bg-[var(--surface-muted)] rounded-lg animate-pulse" />
            </div>
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {[1, 2].map(i => (
            <div key={i} className="bg-[var(--surface)] rounded-xl p-6 border border-[var(--border)]">
              <div className="h-6 w-48 bg-[var(--surface-muted)] rounded-lg animate-pulse mb-6" />
              <div className="h-64 bg-[var(--surface-muted)] rounded-lg animate-pulse" />
            </div>
          ))}
        </div>

        {/* Trending confessions skeleton */}
        <div className="bg-[var(--surface)] rounded-xl p-6 border border-[var(--border)]">
          <div className="h-8 w-64 bg-[var(--surface-muted)] rounded-lg animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-[var(--surface-muted)] rounded-xl p-5">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-[var(--surface-elevated)] rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-3">
                    <div className="h-6 w-full bg-[var(--surface-elevated)] rounded-lg animate-pulse" />
                    <div className="h-4 w-3/4 bg-[var(--surface-elevated)] rounded-lg animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};