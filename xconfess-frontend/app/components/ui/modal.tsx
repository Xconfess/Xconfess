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
  const { containerRef } = useFocusTrap({ isOpen, onClose, dialog: true });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Dialog"}
      aria-labelledby={title ? "modal-title" : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        ref={containerRef}
        tabIndex={-1}
        className={cn(
          "relative z-50 w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl",
          "max-h-[90vh] overflow-y-auto",
          "outline-none",
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
            <h2 id="modal-title" className="text-lg font-semibold text-white">
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
