'use client';

import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { useFocusTrap } from '@/app/lib/hooks/useFocusTrap';

interface StepUpModalProps {
  isOpen: boolean;
  onVerify: (credentials: { password?: string; totpToken?: string }) => void;
  onCancel: () => void;
  error: string | null;
  isVerifying: boolean;
}

export default function StepUpModal({
  isOpen,
  onVerify,
  onCancel,
  error,
  isVerifying,
}: StepUpModalProps) {
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [mode, setMode] = useState<'password' | 'totp'>('password');

  const { containerRef } = useFocusTrap({ isOpen, onClose: onCancel, dialog: true });

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (mode === 'password') {
      onVerify({ password });
    } else {
      onVerify({ totpToken });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm your identity"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="border border-[var(--border)] w-full max-w-md rounded-lg bg-[var(--surface)] p-5 outline-none"
      >
        <h3 className="mb-2 text-lg font-semibold text-[var(--foreground)]">
          Confirm your identity
        </h3>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          This action is sensitive. Please re-verify your identity to continue.
        </p>

        <div className="mb-3 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`rounded-md px-3 py-1 ${mode === 'password' ? 'bg-[var(--accent-soft)] text-[var(--primary-deep)]' : 'text-[var(--text-muted)]'}`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode('totp')}
            className={`rounded-md px-3 py-1 ${mode === 'totp' ? 'bg-[var(--accent-soft)] text-[var(--primary-deep)]' : 'text-[var(--text-muted)]'}`}
          >
            Authenticator code
          </button>
        </div>

        {mode === 'password' ? (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="mb-3 min-h-[44px] w-full rounded-md border border-[var(--accent-border)] px-3 text-sm"
          />
        ) : (
          <input
            type="text"
            value={totpToken}
            onChange={(e) => setTotpToken(e.target.value)}
            placeholder="Enter 6-digit code"
            maxLength={6}
            className="mb-3 min-h-[44px] w-full rounded-md border border-[var(--accent-border)] px-3 text-sm"
          />
        )}

        {error && (
          <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} className="rounded-md">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            isLoading={isVerifying}
            className="rounded-md"
          >
            Verify
          </Button>
        </div>
      </div>
    </div>
  );
}
