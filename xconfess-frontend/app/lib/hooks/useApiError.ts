'use client';

import { useCallback } from 'react';
import { useGlobalToast } from '@/app/components/common/Toast';
import {
  getErrorMessage,
  getErrorCode,
  logError,
  isUnauthorized,
} from '@/app/lib/utils/errorHandler';

interface UseApiErrorOptions {
  showToast?: boolean;
  context?: string;
  onUnauthorized?: () => void;
}

export const useApiError = (options: UseApiErrorOptions = {}) => {
  const toast = useGlobalToast();
  const { showToast = true, context = 'API Error', onUnauthorized } = options;

  const handleError = useCallback(
    (error: unknown, customMessage?: string) => {
      const message = customMessage || getErrorMessage(error);
      const code = getErrorCode(error);

      // Log error for debugging
      logError(error, context, { code });

      // Show toast notification
      if (showToast) {
        toast.error(message, { duration: 5000 });
      }

      // Handle unauthorized
      if (isUnauthorized(error)) {
        onUnauthorized?.();
      }

      return { message, code };
    },
    [context, showToast, toast, onUnauthorized]
  );

  const handleSuccess = useCallback(
    (message = 'Operation successful') => {
      if (showToast) {
        toast.success(message, { duration: 3000 });
      }
    },
    [showToast, toast]
  );

  const handleWarning = useCallback(
    (message: string) => {
      if (showToast) {
        toast.warning(message, { duration: 4000 });
      }
    },
    [showToast, toast]
  );

  return {
    handleError,
    handleSuccess,
    handleWarning,
  };
};
