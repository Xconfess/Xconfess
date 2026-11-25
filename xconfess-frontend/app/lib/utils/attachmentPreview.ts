/**
 * Preview policy for attachments that have already been uploaded or selected.
 *
 * Only a small allow-list of raster images is rendered inline. Everything
 * else (PDF, plain text, unknown or missing MIME types) is shown as a labelled
 * download link, so the browser never parses untrusted content inline.
 */

import { normalizeMimeType } from './attachmentValidation';

/** Types safe to render with an <img> element. SVG is deliberately excluded. */
export const INLINE_PREVIEW_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const INLINE_PREVIEW_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
};

/** URL schemes a preview may link to. Relative and data: URLs are refused. */
const SAFE_PREVIEW_PROTOCOLS: readonly string[] = ['https:', 'blob:'];

export type AttachmentPreviewKind = 'image' | 'download';

export function getAttachmentPreviewKind(
  type: string | null | undefined,
  name?: string | null,
): AttachmentPreviewKind {
  const mimeType = normalizeMimeType(type);
  const extension = name?.trim().match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase();

  return INLINE_PREVIEW_EXTENSIONS[mimeType]?.includes(extension ?? '')
    ? 'image'
    : 'download';
}

/** True only for absolute https: or blob: URLs. Anything else is not rendered as a link. */
export function isSafePreviewUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    return SAFE_PREVIEW_PROTOCOLS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Fallback label for the download link, e.g. "Download notes.pdf". */
export function getDownloadLabel(name: string): string {
  const trimmedName = name.trim();
  return trimmedName ? `Download ${trimmedName}` : 'Download attachment';
}
