'use client';

import { useCallback, useState } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  /** Backend request correlation ID — shown on failure toasts to aid support (issue #801). */
  requestId?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const DEFAULT_DURATION = 3000;

export interface ToastOptions {
  duration?: number;
  /** Backend request correlation ID to surface in support-facing failure toasts. */
  requestId?: string;
  action?: Toast['action'];
}

export const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (
      message: string,
      type: 'success' | 'error' | 'warning' | 'info' = 'info',
      duration = DEFAULT_DURATION,
      action?: Toast['action'],
      requestId?: string,
    ): string => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const toast: Toast = { id, message, type, duration, action, requestId };

      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, options?: ToastOptions) =>
      addToast(message, 'success', options?.duration, options?.action, options?.requestId),
    [addToast]
  );

  const error = useCallback(
    (message: string, options?: ToastOptions) =>
      addToast(message, 'error', options?.duration, options?.action, options?.requestId),
    [addToast]
  );

  const warning = useCallback(
    (message: string, options?: ToastOptions) =>
      addToast(message, 'warning', options?.duration, options?.action, options?.requestId),
    [addToast]
  );

  const info = useCallback(
    (message: string, options?: ToastOptions) =>
      addToast(message, 'info', options?.duration, options?.action, options?.requestId),
    [addToast]
  );

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };
};
