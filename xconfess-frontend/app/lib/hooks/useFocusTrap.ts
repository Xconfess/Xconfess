'use client';

import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface UseFocusTrapOptions {
  isOpen: boolean;
  onClose?: () => void;
  /** If true, the trap is used as a dialog (focuses first element, restores on close) */
  dialog?: boolean;
}

/**
 * Traps keyboard focus inside a container element when active.
 * Optionally handles Escape to close, auto-focuses the first interactive
 * element on open, and restores focus to the previously-active element on close.
 *
 * Usage:
 *   const { containerRef } = useFocusTrap({ isOpen: showModal, onClose: handleClose, dialog: true });
 *   return <div ref={containerRef}>...</div>;
 */
export function useFocusTrap({ isOpen, onClose, dialog = false }: UseFocusTrapOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getFocusable = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    // Save the previously focused element so we can restore it on close
    if (dialog) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    // Auto-focus the first focusable element
    const timer = requestAnimationFrame(() => {
      const focusable = getFocusable();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        containerRef.current?.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes the dialog
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }

      // Tab trap
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // Use capture phase to intercept Tab before it reaches the browser chrome
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    // Lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener('keydown', handleKeyDown, { capture: true } as EventListenerOptions);
      document.body.style.overflow = prevOverflow;

      if (dialog && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose, dialog, getFocusable]);

  return { containerRef };
}
