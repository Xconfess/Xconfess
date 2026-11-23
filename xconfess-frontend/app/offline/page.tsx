export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="mb-4 font-editorial text-4xl text-[var(--foreground)]">You&apos;re currently offline</h1>
      <p className="max-w-md text-sm leading-7 text-[var(--secondary)]">
        We can&apos;t load the feed right now. Check your internet connection and try again.
        Any confessions you save while offline will sync automatically when you&apos;re back online.
      </p>
    </main>
  );
}
