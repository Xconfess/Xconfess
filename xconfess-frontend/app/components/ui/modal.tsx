"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { Button } from "./button";
import { useFocusTrap } from "@/app/lib/hooks/useFocusTrap";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className,
}) => {
  const titleId = React.useId();
  const { containerRef } = useFocusTrap({ isOpen, onClose, dialog: true });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Dialog"}
      aria-labelledby={title ? titleId : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        ref={containerRef}
        tabIndex={-1}
        className={cn(
          "relative z-50 w-full max-w-lg rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--foreground)] shadow-[var(--shadow-popover)]",
          "max-h-[90vh] overflow-y-auto",
          "outline-none",
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <h2 id={titleId} className="text-base font-semibold text-[var(--foreground)]">
              {title}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close modal"
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};
