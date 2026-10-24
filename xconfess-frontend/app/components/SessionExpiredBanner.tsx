'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface SessionExpiredBannerProps {
  variant?: 'banner' | 'fullscreen';
}

export function SessionExpiredBanner({ variant = 'banner' }: SessionExpiredBannerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMessagesRoute = pathname?.startsWith('/messages') ?? false;

  const handleLogin = useCallback(() => {
    const returnTo = pathname && pathname !== '/login' ? pathname : '/';
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [pathname, router]);

  if (variant === 'fullscreen') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="rounded-full h-12 w-12 bg-[var(--danger)]/10 flex items-center justify-center mx-auto mb-4">
            <svg
              className="h-6 w-6 text-[var(--danger)]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
            Session Expired
          </h2>
          <p className="text-sm text-[var(--secondary)] mb-6">
            {isMessagesRoute
              ? 'Your unsent draft is saved in this tab. Log in and reopen the conversation to continue; it will not be sent automatically.'
              : 'Your session has expired. Please log in again to continue.'}
          </p>
          <button
            onClick={handleLogin}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <svg
          className="h-5 w-5 shrink-0 text-[var(--danger)]"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <p className="text-sm font-medium text-[var(--foreground)] truncate">
          {isMessagesRoute
            ? 'Your unsent draft is saved in this tab. Log in and reopen the conversation to continue; it will not be sent automatically.'
            : 'Your session has expired. Please log in again to continue.'}
        </p>
      </div>
      <button
        onClick={handleLogin}
        className="shrink-0 rounded-md bg-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 transition-colors"
      >
        Log in
      </button>
    </div>
  );
}
