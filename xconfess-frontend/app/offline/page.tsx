export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="mb-4 font-editorial text-4xl text-[var(--foreground)]">You&apos;re offline</h1>
      <p className="max-w-md text-sm leading-7 text-[var(--secondary)]">
        xConfess needs a connection to load the feed. Your pending confessions are
        saved locally and will sync automatically when you reconnect.
      </p>
    </main>
  );
}
