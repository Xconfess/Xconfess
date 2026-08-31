'use client';

import { useMemo, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { Button } from '@/app/components/ui/button';
import apiClient from '@/app/lib/api/client';
import { Input } from '@/app/components/ui/input';
import { BrandLogo } from '@/app/components/brand/BrandLogo';
import { useAuth } from '@/app/lib/hooks/useAuth';
import { getErrorMessage, extractRequestId } from '@/app/lib/utils/errorHandler';
import { getAuthFieldError } from '@/app/lib/api/authService';
import { RequestIdNotice } from '@/app/components/auth/RequestIdNotice';
import {
  validateRegisterForm,
  parseRegisterForm,
  hasErrors,
  type ValidationErrors,
} from '@/app/lib/utils/validation';

type RegisterField = keyof ValidationErrors;

const passwordChecks = [
  { label: '8 to 72 characters', test: (value: string) => value.length >= 8 && value.length <= 72 },
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
    <div className="editorial-shell min-h-screen px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-5">
            <BrandLogo priority imageClassName="w-[168px] dark:hidden" />
            <BrandLogo priority tone="light" imageClassName="hidden w-[168px] dark:block" />
            <p className="eyebrow">Join privately</p>
            <h1 className="font-editorial text-5xl leading-[0.96] text-[var(--foreground)] sm:text-6xl">
              Create your account.
            </h1>
            <p className="max-w-md text-base leading-8 text-[var(--secondary)]">
              Post anonymously. Stay in control.
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-[var(--secondary)]">
              <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2">
                <ShieldCheck className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
                Encrypted identity
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Automatic sign-in
              </span>
            </div>
          </div>

          <form onSubmit={doRegister} className="luxury-panel rounded-2xl p-7 sm:p-8">
            <div className="space-y-3">
              <p className="eyebrow">Account setup</p>
              <h2 className="font-editorial text-4xl text-[var(--foreground)]">
                Create account
              </h2>
              <p className="text-sm leading-7 text-[var(--secondary)]">
                Already have an account?{' '}
                <Link href="/login" className="text-[var(--primary-deep)] hover:text-[var(--primary)]">
                  Sign in
                </Link>
              </p>
            </div>

            {submitError && (
              <div
                className="mt-5 rounded-xl border border-red-500/25 bg-red-950/30 p-3 text-sm text-red-200"
                role="alert"
              >
                {submitError}
              </div>
            )}

            {errorRequestId && (submitError || hasErrors(errors)) && (
              <RequestIdNotice requestId={errorRequestId} />
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field
                id="register-username"
                label="Username"
                error={errors.username}
              >
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
                        className={passed ? 'h-4 w-4 text-emerald-600' : 'h-4 w-4 text-[var(--secondary)]'}
                        aria-hidden="true"
                      />
                      {check.label}
                    </span>
                  );
                })}
              </div>
            </div>

          <Button
            type="button"
            onClick={doRegister}
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Creating…' : 'Create account'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/login')}
            className="w-full"
          >
            Sign in
          </Button>
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
        <p id={`${id}-error`} className="mt-2 text-sm text-red-600" role="alert">
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
