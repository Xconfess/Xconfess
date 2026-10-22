'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/app/components/admin/ConfirmDialog';
import { useGlobalToast } from '@/app/components/common/Toast';
import type { ToastOptions } from '@/app/lib/hooks/useToast';

type ConfirmVariant = 'default' | 'danger';

export interface AdminConfirmationOptions {
  title: string;
  description: string;
  /** Bullet points describing what the action changes. */
  consequences?: string[];
  action: () => Promise<unknown> | unknown;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  successMessage?: string;
  successOptions?: ToastOptions;
  errorMessage?: string;
  errorOptions?: ToastOptions;
  onSuccess?: (result: unknown) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onCancel?: () => void;
  onSettled?: () => void | Promise<void>;
}

export function useAdminConfirmation() {
  const toast = useGlobalToast();
  const [pendingConfirmation, setPendingConfirmation] =
    useState<AdminConfirmationOptions | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const openConfirmation = (options: AdminConfirmationOptions) => {
    setPendingConfirmation(options);
  };

  const closeConfirmation = () => {
    if (isConfirming || !pendingConfirmation) {
      return;
    }

    pendingConfirmation.onCancel?.();
    setPendingConfirmation(null);
  };

  const handleConfirm = async () => {
    if (!pendingConfirmation || isConfirming) {
      return;
    }

    const activeConfirmation = pendingConfirmation;

    try {
      setIsConfirming(true);
      const result = await activeConfirmation.action();

      if (activeConfirmation.successMessage) {
        toast.success(
          activeConfirmation.successMessage,
          activeConfirmation.successOptions,
        );
      }

      await activeConfirmation.onSuccess?.(result);
      setPendingConfirmation(null);
    } catch (error) {
      if (activeConfirmation.errorMessage) {
        toast.error(
          activeConfirmation.errorMessage,
          activeConfirmation.errorOptions,
        );
      }

      await activeConfirmation.onError?.(error);
    } finally {
      setIsConfirming(false);
      await activeConfirmation.onSettled?.();
    }
  };

  return {
    openConfirmation,
    closeConfirmation,
    isConfirming,
    confirmDialog: (
      <ConfirmDialog
        open={pendingConfirmation !== null}
        onOpenChange={(open) => {
          if (!open && !isConfirming) {
            // Every dismissal path (Escape, outside click, the Cancel button)
            // runs through `ConfirmDialog.requestClose`, which already
            // notified `onCancel`.
            setPendingConfirmation(null);
          }
        }}
        title={pendingConfirmation?.title ?? 'Confirm action'}
        description={pendingConfirmation?.description ?? ''}
        consequences={pendingConfirmation?.consequences}
        confirmLabel={pendingConfirmation?.confirmLabel ?? 'Confirm'}
        cancelLabel={pendingConfirmation?.cancelLabel ?? 'Cancel'}
        variant={pendingConfirmation?.variant ?? 'default'}
        loading={isConfirming}
        onConfirm={() => {
          void handleConfirm();
        }}
        onCancel={pendingConfirmation?.onCancel}
      />
    ),
  };
}
