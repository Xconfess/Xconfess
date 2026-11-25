"use client";

import React, { useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import type { DraftConflict } from "@/app/lib/types/draft";

type ConflictResolution = "keep-local" | "keep-remote" | "review";

interface DraftConflictDialogProps {
  conflict: DraftConflict;
  isOpen: boolean;
  onResolve: (resolution: ConflictResolution) => Promise<void>;
  onCancel: () => void;
}

export const DraftConflictDialog: React.FC<DraftConflictDialogProps> = ({
  conflict,
  isOpen,
  onResolve,
  onCancel,
}) => {
  const [isResolving, setIsResolving] = useState(false);
  const [selectedResolution, setSelectedResolution] =
    useState<ConflictResolution>("review");

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      await onResolve(selectedResolution);
    } finally {
      setIsResolving(false);
    }
  };

  const reasonLabel =
    conflict.reason === "remote_deleted"
      ? "This draft was deleted on another device"
      : "This draft was edited on another device";

  const localContent = conflict.local?.body?.slice(0, 100) || "(empty)";
  const remoteContent = conflict.remote?.body?.slice(0, 100) || "(deleted)";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Draft Conflict"
      aria-label="Resolve draft conflict dialog"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm text-[var(--secondary)]">{reasonLabel}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {new Date(conflict.detectedAt).toLocaleString()}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-2 text-[var(--foreground)]">
              Your Local Draft (preserved)
            </h3>
            <div className="p-3 rounded bg-[var(--surface-muted)] text-xs text-[var(--secondary)] whitespace-pre-wrap">
              {localContent}
              {localContent !== "(empty)" && "..."}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2 text-[var(--foreground)]">
              Server Draft
            </h3>
            <div className="p-3 rounded bg-[var(--surface-muted)] text-xs text-[var(--secondary)] whitespace-pre-wrap">
              {remoteContent}
              {remoteContent !== "(deleted)" && remoteContent !== "(empty)" && "..."}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded border border-[var(--accent-border)] cursor-pointer hover:bg-[var(--surface-muted)]">
            <input
              type="radio"
              name="resolution"
              value="keep-local"
              checked={selectedResolution === "keep-local"}
              onChange={(e) =>
                setSelectedResolution(e.target.value as ConflictResolution)
              }
              disabled={isResolving}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Keep my draft
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Your local changes are preserved
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded border border-[var(--accent-border)] cursor-pointer hover:bg-[var(--surface-muted)]">
            <input
              type="radio"
              name="resolution"
              value="keep-remote"
              checked={selectedResolution === "keep-remote"}
              onChange={(e) =>
                setSelectedResolution(e.target.value as ConflictResolution)
              }
              disabled={isResolving}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Use server version
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Replace with the version from your other device
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded border border-[var(--accent-border)] cursor-pointer hover:bg-[var(--surface-muted)]">
            <input
              type="radio"
              name="resolution"
              value="review"
              checked={selectedResolution === "review"}
              onChange={(e) =>
                setSelectedResolution(e.target.value as ConflictResolution)
              }
              disabled={isResolving}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Review manually
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Both versions are preserved for manual review
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isResolving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={isResolving}
            aria-busy={isResolving}
          >
            {isResolving ? "Resolving..." : "Resolve Conflict"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DraftConflictDialog;
