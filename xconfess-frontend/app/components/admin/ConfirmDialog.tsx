'use client';
import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /**
   * Bullet points describing what the action actually does. Shown so the
   * moderator understands the consequences before confirming a destructive
   * action.
   */
  consequences?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
}: ConfirmDialogProps) {
  const requestClose = () => {
    if (loading) {
      return;
    }

    onCancel?.();
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    requestClose();
  };

  const handleConfirm = () => {
    if (loading) return;
    onConfirm();
  };

  /**
   * Enter confirms the action from anywhere inside the dialog, except when
   * the user is typing in a field or has explicitly focused one of the
   * footer buttons (those keep their native Enter behaviour). Escape always
   * cancels — Radix closes the dialog, which routes through `requestClose`.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || loading) return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();
    if (
      tagName === 'button' ||
      tagName === 'a' ||
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      target?.isContentEditable
    ) {
      return;
    }

    event.preventDefault();
    handleConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!loading}
        onKeyDown={handleKeyDown}
        onEscapeKeyDown={(event) => {
          if (loading) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (loading) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="pt-2 text-sm text-[var(--secondary)]">
            {description}
          </DialogDescription>
          {consequences && consequences.length > 0 && (
            <ul
              data-testid="confirm-dialog-consequences"
              className="mt-3 list-disc space-y-1 pl-5 text-left text-sm text-[var(--secondary)]"
            >
              {consequences.map((consequence) => (
                <li key={consequence}>{consequence}</li>
              ))}
            </ul>
          )}
        </DialogHeader>
        <DialogFooter className="gap-3 sm:justify-end">
          <button
            type="button"
            onClick={requestClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-[var(--secondary)] bg-[var(--surface)] border border-[var(--accent-border)] rounded-md hover:bg-[var(--surface-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
              variant === 'danger'
                ? 'bg-[var(--danger)] hover:opacity-90'
                : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </DialogFooter>
        {!loading && (
          <p className="text-center text-xs text-[var(--text-muted)]">
            Press <kbd>Esc</kbd> to cancel, or <kbd>Tab</kbd> to{' '}
            <kbd>{confirmLabel}</kbd> and press <kbd>Enter</kbd> to confirm.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
