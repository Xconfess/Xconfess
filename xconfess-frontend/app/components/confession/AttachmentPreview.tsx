"use client";

import { useState } from "react";
import { ImageOff, RotateCcw } from "lucide-react";
import {
  getAttachmentPreviewKind,
  getDownloadLabel,
  isSafePreviewUrl,
} from "../../lib/utils/attachmentPreview";
import { formatBytes } from "../../lib/utils/attachmentValidation";

interface AttachmentPreviewProps {
  name: string;
  /** MIME type as reported by the browser or the server. May be empty or unknown. */
  type: string;
  size?: number;
  /** Absolute https: or blob: URL. Other schemes are never rendered as a link. */
  url?: string;
}

/**
 * Renders a single attachment with an inline preview for images. If the
 * image fails to load (network blip, cache corruption, slow CDN) the
 * component switches to an error state with an explicit "Retry" button
 * that reloads the image WITHOUT re-uploading — the upload has already
 * succeeded by the time the preview tries to fetch, so a retry here must
 * never produce a duplicate upload.
 */
export function AttachmentPreview({ name, type, size, url }: AttachmentPreviewProps) {
  const [imageFailed, setImageFailed] = useState(false);
  // Bumped on each retry so React treats the <img> as a new node and the
  // browser actually re-requests it (`?v=N` also busts any failing cache).
  const [retryCount, setRetryCount] = useState(0);

  const hasSafeUrl = isSafePreviewUrl(url);
  const isImageKind = getAttachmentPreviewKind(type, name) === "image";
  const canShowInlineImage = hasSafeUrl && isImageKind;
  const showInlineImage = canShowInlineImage && !imageFailed;
  const showImageError = canShowInlineImage && imageFailed;

  const handleRetry = () => {
    setImageFailed(false);
    setRetryCount((n) => n + 1);
  };

  const imgSrc =
    showInlineImage && url
      ? retryCount > 0
        ? `${url}${url.includes("?") ? "&" : "?"}__preview_retry=${retryCount}`
        : url
      : undefined;

  return (
    <figure className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
      {showInlineImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={retryCount}
          src={imgSrc}
          alt={name}
          onError={() => setImageFailed(true)}
          className="max-h-48 w-full rounded-lg object-contain"
        />
      ) : showImageError ? (
        <div
          role="group"
          aria-label={`Preview failed for ${name}`}
          data-testid="attachment-preview-error"
          className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3"
        >
          <div className="flex items-start gap-2">
            <ImageOff
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--foreground)]">
                Couldn&apos;t load this preview.
              </p>
              <p className="text-xs text-[var(--secondary)]">
                The file was uploaded successfully — the preview can&apos;t
                be fetched right now. Retrying only reloads the image; it
                won&apos;t re-upload the file.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            aria-label={`Retry loading preview for ${name}`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry preview
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-[var(--foreground)]">{name}</span>
          <span className="text-xs text-[var(--secondary)]">
            {type ? type : "Unknown file type"}
            {size !== undefined ? ` · ${formatBytes(size)}` : ""}
          </span>
        </div>
      )}

      <figcaption>
        {hasSafeUrl ? (
          <a
            href={url}
            download={name}
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            {getDownloadLabel(name)}
          </a>
        ) : (
          <span className="text-xs text-[var(--secondary)]">Preview unavailable</span>
        )}
      </figcaption>
    </figure>
  );
}

export default AttachmentPreview;
