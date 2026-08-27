'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../lib/hooks/useAuth';
import { SessionExpiredBanner } from './SessionExpiredBanner';

/**
 * Maximum number of consecutive redirect attempts before the guard
 * assumes a loop and stops redirecting. This prevents the browser from
 * entering an infinite redirect cycle when, e.g., the session cookie is
 * present but permanently invalid.
 */
const MAX_REDIRECT_ATTEMPTS = 3;

/**
 * Minimum interval (ms) between consecutive redirect calls.
 * Prevents rapid-fire navigation during React re-render bursts.
 */
const REDIRECT_COOLDOWN_MS = 2000;

/**
 * AuthGuard component props
 */
interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard Component
 *
 * Protects routes by redirecting unauthenticated users to the login page.
 * Includes safeguards against:
 * - Redirect loops (capped at MAX_REDIRECT_ATTEMPTS)
 * - Stale/expired session cookies (shows user-friendly error)
 * - Race conditions during auth refresh (cooldown debounce)
 * - Navigating away from /login back into a redirect (pathname check)
 *
 * @example
 * ```tsx
 * <AuthGuard>
 *   <ProtectedContent />
 * </AuthGuard>
 * ```
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, isSessionExpired } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // --- Redirect-loop protection refs (survive re-renders) ---
  const redirectCount = useRef(0);
  const lastRedirectTime = useRef(0);
  const hasRedirected = useRef(false);
  const [maxRedirectsReached, setMaxRedirectsReached] = useState(false);

  const isDevBypassEnabled =
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

  /**
   * Reset the redirect counter whenever the user becomes authenticated.
   * This ensures a fresh budget after a successful login.
   */
  useEffect(() => {
    if (isAuthenticated) {
      redirectCount.current = 0;
      lastRedirectTime.current = 0;
      hasRedirected.current = false;
      setMaxRedirectsReached(false);
    }
  }, [isAuthenticated]);

  /**
   * Safely push to /login with loop-break and cooldown logic.
   */
  const safeRedirectToLogin = useCallback(() => {
    // Already on the login page — nothing to do
    if (pathname === '/login' || pathname === '/register') {
      return;
    }

    // Exceeded max consecutive redirects → assume a loop, bail out
    if (redirectCount.current >= MAX_REDIRECT_ATTEMPTS) {
      setMaxRedirectsReached(true);
      return;
    }

    // Cooldown: skip if we redirected too recently (race-condition guard)
    const now = Date.now();
    if (now - lastRedirectTime.current < REDIRECT_COOLDOWN_MS) {
      return;
    }

    redirectCount.current += 1;
    lastRedirectTime.current = now;
    hasRedirected.current = true;
    const returnTo = pathname && pathname !== '/login' ? `?returnTo=${encodeURIComponent(pathname)}` : '';
    router.push(`/login${returnTo}`);
  }, [pathname, router]);

  /**
   * Core redirect effect — only fires when loading is complete and
   * the user is confirmed unauthenticated.
   */
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isDevBypassEnabled && !isSessionExpired) {
      safeRedirectToLogin();
    }
  }, [isAuthenticated, isLoading, isDevBypassEnabled, safeRedirectToLogin, isSessionExpired]);

  // --- Render logic ---

  // Dev bypass: skip all auth checks
  if (isDevBypassEnabled) {
    return <>{children}</>;
  }

  if (isSessionExpired && !isAuthenticated) {
    return <SessionExpiredBanner variant="fullscreen" />;
  }

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && maxRedirectsReached) {
    return <SessionExpiredBanner variant="fullscreen" />;
  }

  // Don't render protected content if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
