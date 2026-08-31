'use client';

import { RefObject, useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface UseFocusTrapOptions {
  isOpen?: boolean;
  active?: boolean;
  onClose?: () => void;
  onEscape?: () => void;
  containerRef?: RefObject<HTMLDivElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  trapFocus?: boolean;
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
export function useFocusTrap({
  isOpen,
  active,
  onClose,
  onEscape,
  containerRef: providedContainerRef,
  initialFocusRef,
  restoreFocusRef,
  trapFocus = true,
  dialog = false,
}: UseFocusTrapOptions) {
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = providedContainerRef ?? internalContainerRef;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getFocusable = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
    );
  }, [containerRef]);

  useEffect(() => {
    if (!isOpen && !active) return;

    // Save the previously focused element so we can restore it on close
    if (dialog) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    // Auto-focus the first focusable element
    const timer = requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }

      const focusable = getFocusable();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        containerRef.current?.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes the dialog
      const close = onEscape ?? onClose;
      if (e.key === 'Escape' && close) {
        e.stopPropagation();
        close();
        return;
      }

      // Tab trap
      if (!trapFocus || e.key !== 'Tab') return;
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

      const restoreTarget = restoreFocusRef?.current ?? previousFocusRef.current;
      if (restoreTarget && (dialog || restoreFocusRef)) {
        restoreTarget.focus();
      }
    };
  }, [
    isOpen,
    active,
    onClose,
    onEscape,
    dialog,
    getFocusable,
    containerRef,
    initialFocusRef,
    restoreFocusRef,
    trapFocus,
  ]);

  return { containerRef };
}
