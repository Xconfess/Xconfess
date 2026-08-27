export default function DiagnosticsLoading() {
  return (
    <div
      className="space-y-6 max-w-4xl mx-auto p-4"
      role="status"
      aria-live="polite"
      aria-label="Loading diagnostics"
    >
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-96 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
          />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-48 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900"
        />
      ))}
    </div>
  );
}
