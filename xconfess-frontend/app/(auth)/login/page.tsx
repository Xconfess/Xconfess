'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { BrandLogo } from '@/app/components/brand/BrandLogo';
import { useAuth } from '@/app/lib/hooks/useAuth';
import { isSafeAuthRedirect } from '@/app/lib/utils/auth-redirect';
import { extractRequestId } from '@/app/lib/utils/errorHandler';
import { RequestIdNotice } from '@/app/components/auth/RequestIdNotice';
import { InlineError } from '@/app/components/common/InlineError';
import {
  validateLoginForm,
  parseLoginForm,
  hasErrors,
  type ValidationErrors,
} from '@/app/lib/utils/validation';

const showDevMockAdminLogin =
  process.env.NODE_ENV === 'development' &&
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
    <div className="min-h-screen px-4 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="space-y-8">
          <div className="flex justify-center">
            <BrandLogo href={null} priority imageClassName="w-[132px] dark:hidden" />
            <BrandLogo href={null} priority tone="light" imageClassName="hidden w-[132px] dark:block" />
          </div>
          <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold text-[var(--foreground)]">
                Login
              </h1>
              <p className="text-sm leading-6 text-[var(--secondary)]">
                Welcome back. Sign in to continue.
              </p>
            </div>

            {errors.email && (
              <div
                id="login-email-error"
                role="alert"
                className="mt-5 rounded-xl border border-[var(--danger)]/25 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]"
              >
                {errors.email}
              </div>
            )}

            {errors.password && !errors.email && (
              <div
                id="login-password-error"
                role="alert"
                className="mt-5 rounded-xl border border-[var(--danger)]/25 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]"
              >
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
                  error={Boolean(errors.email)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
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
                  error={Boolean(errors.password)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password && !errors.email ? 'login-password-error' : undefined}
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
