'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/hooks/useAuth';
import { SessionExpiredBanner } from './SessionExpiredBanner';

const PUBLIC_AUTH_PATHS = new Set(['/login', '/register', '/forgot-password']);

/** Protect authenticated surfaces without making the public social experience wallet-dependent. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, isSessionExpired } = useAuth();
  const redirectStarted = useRef(false);
  const isPublicAuthPath = PUBLIC_AUTH_PATHS.has(pathname || '');

  useEffect(() => {
    if (isAuthenticated) {
      redirectStarted.current = false;
      return;
    }
    if (isLoading || isSessionExpired || isPublicAuthPath || redirectStarted.current) return;
    redirectStarted.current = true;
    const returnTo = pathname || '/';
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [isAuthenticated, isLoading, isSessionExpired, isPublicAuthPath, pathname, router]);

  if (isPublicAuthPath || isAuthenticated) return <>{children}</>;
  if (isSessionExpired) return <SessionExpiredBanner variant="fullscreen" />;
  if (isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center" role="status" aria-live="polite">
        <p className="text-sm text-[var(--secondary)]">Loading...</p>
      </div>
    );
  }
  return null;
}
