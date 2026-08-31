'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { BrandLogo } from '@/app/components/brand/BrandLogo';
import { useAuth } from '@/app/lib/hooks/useAuth';
import { isSafeAuthRedirect } from '@/app/lib/utils/auth-redirect';
import { extractRequestId } from '@/app/lib/utils/errorHandler';
import { RequestIdNotice } from '@/app/components/auth/RequestIdNotice';
import {
  validateLoginForm,
  parseLoginForm,
  hasErrors,
  type ValidationErrors,
} from '@/app/lib/utils/validation';

const showDevMockAdminLogin =
  process.env.NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN === 'true';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [errorRequestId, setErrorRequestId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const doMockAdminLogin = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'mock',
          mock: true,
        }),
      });
      router.push(getAuthRedirectTarget('/admin/dashboard'));
    } catch {
      setErrors({ password: 'Mock login failed' });
    } finally {
      setLoading(false);
    }
  };

  const doLogin = async () => {
    const validationErrors = validateLoginForm({ email, password });
    setErrors(validationErrors);

    if (hasErrors(validationErrors)) {
      return;
    }

    const parsed = parseLoginForm({ email, password });
    if (!parsed.success) {
      setErrors(parsed.errors);
      return;
    }

    setLoading(true);
    setErrors({});
    setErrorRequestId(undefined);
    try {
      const user = await login({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      router.push(
        getAuthRedirectTarget(
          user.role === 'admin' ? '/admin/dashboard' : '/dashboard',
        ),
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Login failed';
      setErrors({ password: message });
      setErrorRequestId(extractRequestId(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="editorial-shell min-h-screen px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="space-y-5">
            <BrandLogo href={null} priority imageClassName="w-[168px] dark:hidden" />
            <BrandLogo href={null} priority tone="light" imageClassName="hidden w-[168px] dark:block" />
            <p className="eyebrow">Private access</p>
            <h1 className="font-editorial text-5xl leading-[0.96] text-[var(--foreground)] sm:text-6xl">
              Login
            </h1>
            <p className="max-w-md text-base leading-8 text-[var(--secondary)]">
              Continue to your private account.
            </p>
          </div>

          <div className="luxury-panel rounded-2xl p-7 sm:p-8">
            <div className="space-y-3">
              <p className="eyebrow">Account sign in</p>
              <h2 className="font-editorial text-4xl text-[var(--foreground)]">
                Sign in
              </h2>
              <p className="text-sm leading-7 text-[var(--secondary)]">
                Sign in with your account credentials.
              </p>
            </div>

            {errors.email && (
              <div className="mt-5 rounded-xl border border-red-500/25 bg-red-950/30 p-3 text-sm text-red-200">
                {errors.email}
              </div>
            )}

            {errors.password && !errors.email && (
              <div className="mt-5 rounded-xl border border-red-500/25 bg-red-950/30 p-3 text-sm text-red-200">
                {errors.password}
              </div>
            )}

            {errorRequestId && (errors.email || errors.password) && (
              <RequestIdNotice requestId={errorRequestId} />
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-2 block text-sm font-medium text-[var(--foreground)]"
                >
                  Email
                </label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) {
                      setErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-2 block text-sm font-medium text-[var(--foreground)]"
                >
                  Password
                </label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) {
                      setErrors((prev) => ({ ...prev, password: undefined }));
                    }
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>

              <div className="text-sm">
                <Link
                  href="/forgot-password"
                  className="text-[var(--primary-deep)] hover:text-[var(--primary)]"
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="button"
                onClick={doLogin}
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/register')}
                className="w-full"
              >
                Create account
              </Button>

              {showDevMockAdminLogin && (
                <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
                  <p className="mb-3 text-xs leading-6 text-[var(--secondary)]">
                    Dev-only: mock admin shortcut. Enable with{' '}
                    <code className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 font-mono text-[var(--foreground)]">
                      NEXT_PUBLIC_ENABLE_DEV_MOCK_ADMIN_LOGIN=true
                    </code>
                    .
                  </p>
                  <Button
                    type="button"
                    onClick={doMockAdminLogin}
                    disabled={loading}
                    variant="outline"
                    className="w-full"
                  >
                    Mock Admin Login
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getAuthRedirectTarget(fallback: string): string {
  if (typeof window === 'undefined') return fallback;

  const next = new URLSearchParams(window.location.search).get('next');
  return isSafeAuthRedirect(next) ? next : fallback;
}

function buildAuthSwitchUrl(path: '/register' | '/login'): string {
  if (typeof window === 'undefined') return path;

  const next = new URLSearchParams(window.location.search).get('next');
  return isSafeAuthRedirect(next)
    ? `${path}?next=${encodeURIComponent(next)}`
    : path;
}

