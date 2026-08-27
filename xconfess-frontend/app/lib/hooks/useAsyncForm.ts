'use client';

import { useState, useCallback } from 'react';
import { useGlobalToast } from '@/app/components/common/Toast';
import {
  getErrorMessage,
  logError,
} from '@/app/lib/utils/errorHandler';

interface UseAsyncFormOptions<T> {
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
  showToast?: boolean;
  successMessage?: string;
  context?: string;
}

export const useAsyncForm = <T = unknown>(
  asyncFn: () => Promise<T>,
  options: UseAsyncFormOptions<T> = {}
) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useGlobalToast();

  const {
    onSuccess,
    onError,
    showToast = true,
    successMessage = 'Operation completed successfully',
    context = 'Form Submission',
  } = options;

  const execute = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await asyncFn();

      if (showToast) {
        toast.success(successMessage);
      }

      onSuccess?.(result);
      return result;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);

      logError(err, context);

      if (showToast) {
        toast.error(errorMessage);
      }

      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [asyncFn, onSuccess, onError, showToast, successMessage, context, toast]);

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return {
    execute,
    loading,
    error,
    reset,
  };
};
