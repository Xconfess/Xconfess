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
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl outline-none dark:bg-gray-800"
      >
        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
          Confirm your identity
        </h3>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          This action is sensitive. Please re-verify your identity to continue.
        </p>

        <div className="mb-3 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`rounded-md px-3 py-1 ${mode === 'password' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200' : 'text-gray-500'}`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setMode('totp')}
            className={`rounded-md px-3 py-1 ${mode === 'totp' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200' : 'text-gray-500'}`}
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
            className="mb-3 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        ) : (
          <input
            type="text"
            value={totpToken}
            onChange={(e) => setTotpToken(e.target.value)}
            placeholder="Enter 6-digit code"
            maxLength={6}
            className="mb-3 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        )}

        {error && (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
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
