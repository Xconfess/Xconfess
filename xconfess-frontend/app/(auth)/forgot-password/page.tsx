'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { BrandLogo } from '@/app/components/brand/BrandLogo';
import {
  validateForgotPasswordForm,
  parseForgotPasswordForm,
  hasErrors,
  type ValidationErrors,
} from '@/app/lib/utils/validation';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const onSubmit = async () => {
    const validationErrors = validateForgotPasswordForm({ email });
    setErrors(validationErrors);

    if (hasErrors(validationErrors)) {
      return;
    }

    const parsed = parseForgotPasswordForm({ email });
    if (!parsed.success) {
      setErrors(parsed.errors);
      return;
    }

    setLoading(true);
    setErrors({});
    setStatusMessage('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parsed.data.email }),
      });

      if (!response.ok) {
        throw new Error('Unable to send reset instructions right now. Please try again later.');
      }

      setStatusMessage(
        'If an account exists for this email, reset instructions have been sent. Please check your inbox.'
      );
    } catch {
      setStatusMessage(
        'If an account exists for this email, reset instructions have been sent. Please check your inbox.'
      );
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
          <div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold text-[var(--foreground)]">
                Reset password
              </h1>
              <p className="text-sm leading-6 text-[var(--secondary)]">
                Enter your email and we&apos;ll send a reset link if an account exists.
              </p>
            </div>

            {statusMessage && (
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm text-[var(--foreground)]">
                {statusMessage}
              </div>
            )}

            {errors.email && (
              <div
                id="forgot-email-error"
                role="alert"
                className="mt-5 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]"
              >
                {errors.email}
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="forgot-password-email"
                  className="mb-2 block text-sm font-medium text-[var(--foreground)]"
                >
                  Email
                </label>
                <Input
                  id="forgot-password-email"
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
                  aria-describedby={errors.email ? 'forgot-email-error' : undefined}
                />
              </div>

              <Button
                type="button"
                onClick={onSubmit}
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Sending reset link…' : 'Send reset link'}
              </Button>

              <p className="text-sm text-[var(--secondary)]">
                Remembered your password?{' '}
                <Link href="/login" className="text-[var(--primary-deep)] hover:text-[var(--primary-deep)]">
                  Sign in instead.
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
