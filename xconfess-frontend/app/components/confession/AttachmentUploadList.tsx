"use client";

import type { PendingUpload } from "../../lib/hooks/useAttachmentUpload";

interface AttachmentUploadListProps {
  uploads: PendingUpload[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentUploadList({ uploads, onCancel, onRetry }: AttachmentUploadListProps) {
  if (uploads.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Attachment uploads">
      {uploads.map((upload) => (
        <li
          key={upload.id}
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-[var(--foreground)]">
                {upload.file.name}
              </span>
              <span className="shrink-0 text-xs text-[var(--secondary)]">
                {formatFileSize(upload.file.size)}
              </span>
            </div>

            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]"
              role="progressbar"
              aria-valuenow={upload.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Upload progress for ${upload.file.name}`}
            >
              <div
                className={`h-full rounded-full transition-all ${
                  upload.status === "error" ? "bg-red-400" : "bg-[var(--primary)]"
                }`}
                style={{ width: `${upload.status === "error" ? 100 : upload.progress}%` }}
              />
            </div>

            <p className="mt-1 text-xs text-[var(--secondary)]">
              {upload.status === "uploading" && `Uploading... ${upload.progress}%`}
              {upload.status === "pending" && "Waiting to upload..."}
              {upload.status === "success" && "Uploaded"}
              {upload.status === "error" && (upload.error ?? "Upload failed")}
            </p>
          </div>

          <div className="flex shrink-0 gap-1">
            {upload.status === "error" && (
              <button
                type="button"
                onClick={() => onRetry(upload.id)}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
              >
                Retry
              </button>
            )}
            {(upload.status === "uploading" || upload.status === "pending" || upload.status === "error") && (
              <button
                type="button"
                onClick={() => onCancel(upload.id)}
                aria-label={`Cancel upload of ${upload.file.name}`}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default AttachmentUploadList;
