'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface SessionExpiredBannerProps {
  variant?: 'banner' | 'fullscreen';
}

export function SessionExpiredBanner({ variant = 'banner' }: SessionExpiredBannerProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogin = useCallback(() => {
    const returnTo = pathname && pathname !== '/login' ? pathname : '/';
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [pathname, router]);

  if (variant === 'fullscreen') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="rounded-full h-12 w-12 bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Session Expired
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Your session has expired. Please log in again to continue.
          </p>
          <button
            onClick={handleLogin}
            className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors"
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
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-4 py-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <svg
          className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
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
        <p className="text-sm font-medium text-red-800 dark:text-red-200 truncate">
          Your session has expired. Please log in again to continue.
        </p>
      </div>
      <button
        onClick={handleLogin}
        className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
      >
        Log in
      </button>
    </div>
  );
}
