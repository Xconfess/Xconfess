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
  const [submitted, setSubmitted] = useState(false);
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

      setSubmitted(true);
      setStatusMessage(
        'If an account exists for this email, reset instructions have been sent. Please check your inbox.'
      );
    } catch (error) {
      setStatusMessage(
        'If an account exists for this email, reset instructions have been sent. Please check your inbox.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="editorial-shell min-h-screen px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="space-y-5">
            <BrandLogo priority imageClassName="w-[168px] dark:hidden" />
            <BrandLogo priority tone="light" imageClassName="hidden w-[168px] dark:block" />
            <p className="eyebrow">Password reset</p>
            <h1 className="font-editorial text-5xl leading-[0.96] text-[var(--foreground)] sm:text-6xl">
              Reset password.
            </h1>
            <p className="max-w-md text-base leading-8 text-[var(--secondary)]">
              Enter your email to receive a reset link.
            </p>
          </div>

          <div className="luxury-panel rounded-[34px] p-7 sm:p-8">
            <div className="space-y-3">
              <p className="eyebrow">Forgot password</p>
              <h2 className="font-editorial text-4xl text-[var(--foreground)]">
                Reset request
              </h2>
              <p className="text-sm leading-7 text-[var(--secondary)]">
                For security, we won&apos;t reveal whether the email is registered.
              </p>
            </div>

            {statusMessage && (
              <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900">
                {statusMessage}
              </div>
            )}

            {errors.email && (
              <div className="mt-5 rounded-[20px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
                <Link href="/login" className="text-indigo-600 hover:text-indigo-500">
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
