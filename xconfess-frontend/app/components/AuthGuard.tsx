'use client';

/** Public routes are wallet-first; admin pages enforce their own auth. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
