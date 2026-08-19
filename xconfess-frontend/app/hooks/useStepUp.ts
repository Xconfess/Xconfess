'use client';

import { useState, useCallback } from 'react';
import { adminApi } from '@/app/lib/api/admin';

export function useStepUp() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<((token: string) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const requestStepUp = useCallback((onVerified: (token: string) => void) => {
    setPendingAction(() => onVerified);
    setError(null);
    setIsModalOpen(true);
  }, []);

  const verify = useCallback(
    async (credentials: { password?: string; totpToken?: string }) => {
      setIsVerifying(true);
      setError(null);
      try {
        const result = await adminApi.requestStepUp(credentials);
        setIsModalOpen(false);
        if (pendingAction) {
          pendingAction(result.stepUpToken);
        }
        setPendingAction(null);
      } catch (err: any) {
        setError(
          err?.response?.data?.message || 'Verification failed. Please try again.',
        );
      } finally {
        setIsVerifying(false);
      }
    },
    [pendingAction],
  );

  const cancel = useCallback(() => {
    setIsModalOpen(false);
    setPendingAction(null);
    setError(null);
  }, []);

  return { isModalOpen, requestStepUp, verify, cancel, error, isVerifying };
}