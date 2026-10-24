'use client';

import { useMemo, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { BrandLogo } from '@/app/components/brand/BrandLogo';
import { useAuth } from '@/app/lib/hooks/useAuth';
import { getErrorMessage, extractRequestId } from '@/app/lib/utils/errorHandler';
import { getAuthFieldError } from '@/app/lib/api/authService';
import { RequestIdNotice } from '@/app/components/auth/RequestIdNotice';
import { InlineError } from '@/app/components/common/InlineError';
import {
  validateRegisterForm,
  parseRegisterForm,
  hasErrors,
  type ValidationErrors,
} from '@/app/lib/utils/validation';

type RegisterField = keyof ValidationErrors;

const passwordChecks = [
  {
    label: '8 to 72 characters',
    test: (value: string) => value.length >= 8 && value.length <= 72,
  },
  { label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'One number', test: (value: string) => /\d/.test(value) },
  {
    label: 'One special character',
    test: (value: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value),
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [errorRequestId, setErrorRequestId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const completedChecks = useMemo(
    () => passwordChecks.filter((check) => check.test(password)).length,
    [password],
  );

  const handleFieldChange = (field: RegisterField, value: string) => {
    if (field === 'username') setUsername(value);
    if (field === 'email') setEmail(value);
    if (field === 'password') setPassword(value);
    if (field === 'confirmPassword') setConfirmPassword(value);

    setSubmitError('');
    setErrorRequestId(undefined);
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const doRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = { username, email, password, confirmPassword };
    const validationErrors = validateRegisterForm(formData);
    setErrors(validationErrors);
    setSubmitError('');
    setErrorRequestId(undefined);

    if (hasErrors(validationErrors)) {
      return;
    }

    const parsed = parseRegisterForm(formData);
    if (!parsed.success) {
      setErrors(parsed.errors);
      return;
    }

    setLoading(true);
    try {
      await register({
        username: parsed.data.username,
        email: parsed.data.email,
        password: parsed.data.password,
      });
      router.push(getAuthRedirectTarget('/dashboard'));
    } catch (error) {
      const field = getAuthFieldError(error);
      const message = getErrorMessage(error);
      setErrorRequestId(extractRequestId(error));
      if (field) {
        setErrors((prev) => ({ ...prev, [field]: message }));
        setSubmitError('');
      } else {
        setSubmitError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="space-y-8">
          <div className="flex justify-center">
            <BrandLogo priority imageClassName="w-[132px] dark:hidden" />
            <BrandLogo priority tone="light" imageClassName="hidden w-[132px] dark:block" />
          </div>
          <form onSubmit={doRegister} className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold text-[var(--foreground)]">
                Create account
              </h1>
              <p className="text-sm leading-6 text-[var(--secondary)]">
                Already have an account?{' '}
                <Link href={buildAuthSwitchUrl('/login')} className="text-[var(--primary-deep)] hover:text-[var(--primary)]">
                  Sign in
                </Link>
              </p>
            </div>

            <InlineError message={submitError} className="mt-5" />

            {errorRequestId && (submitError || hasErrors(errors)) && (
              <RequestIdNotice requestId={errorRequestId} />
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field id="register-username" label="Username" error={errors.username}>
                <Input
                  id="register-username"
                  value={username}
                  onChange={(event) => handleFieldChange('username', event.target.value)}
                  placeholder="alice_42"
                  autoComplete="username"
                  error={Boolean(errors.username)}
                  aria-invalid={Boolean(errors.username)}
                  aria-describedby={errors.username ? 'register-username-error' : undefined}
                  disabled={loading}
                />
              </Field>

              <Field id="register-email" label="Email" error={errors.email}>
                <Input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(event) => handleFieldChange('email', event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  error={Boolean(errors.email)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'register-email-error' : undefined}
                  disabled={loading}
                />
              </Field>

              <Field id="register-password" label="Password" error={errors.password}>
                <div className="relative">
                  <Input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => handleFieldChange('password', event.target.value)}
                    placeholder="Str0ng!Pass#1"
                    autoComplete="new-password"
                    error={Boolean(errors.password)}
                    className="pr-12"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'register-password-error' : undefined}
                    disabled={loading}
                  />
                  <IconButton
                    label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </IconButton>
                </div>
              </Field>

              <Field
                id="register-confirm-password"
                label="Confirm password"
                error={errors.confirmPassword}
              >
                <div className="relative">
                  <Input
                    id="register-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) =>
                      handleFieldChange('confirmPassword', event.target.value)
                    }
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    error={Boolean(errors.confirmPassword)}
                    className="pr-12"
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={
                      errors.confirmPassword
                        ? 'register-confirm-password-error'
                        : undefined
                    }
                    disabled={loading}
                  />
                  <IconButton
                    label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirmPassword((value) => !value)}
                  >
                    {showConfirmPassword ? <EyeOff /> : <Eye />}
                  </IconButton>
                </div>
              </Field>
            </div>

            <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)] transition-all"
                  style={{ width: `${(completedChecks / passwordChecks.length) * 100}%` }}
                />
              </div>
              <div className="grid gap-2 text-xs text-[var(--secondary)] sm:grid-cols-2">
                {passwordChecks.map((check) => {
                  const passed = check.test(password);
                  return (
                    <span key={check.label} className="inline-flex items-center gap-2">
                      <CheckCircle2
                        className={passed ? 'h-4 w-4 text-[var(--success)]' : 'h-4 w-4 text-[var(--secondary)]'}
                        aria-hidden="true"
                      />
                      {check.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <Button type="submit" disabled={loading} isLoading={loading} className="mt-6 w-full">
              {loading ? 'Creating account...' : 'Create account'}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(buildAuthSwitchUrl('/login'))}
              className="mt-3 w-full"
              disabled={loading}
            >
              Sign in
            </Button>
          </form>
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

function isSafeAuthRedirect(value: string | null): value is string {
  return Boolean(value && value.startsWith('/') && !value.startsWith('//'));
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactElement;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--secondary)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
    >
      {children}
    </button>
  );
}
