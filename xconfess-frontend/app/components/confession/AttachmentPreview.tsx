"use client";

import { useState } from "react";
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

export function AttachmentPreview({ name, type, size, url }: AttachmentPreviewProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const hasSafeUrl = isSafePreviewUrl(url);
  const showInlineImage =
    hasSafeUrl && getAttachmentPreviewKind(type, name) === "image" && !imageFailed;

  return (
    <figure className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
      {showInlineImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          onError={() => setImageFailed(true)}
          className="max-h-48 w-full rounded-lg object-contain"
        />
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
