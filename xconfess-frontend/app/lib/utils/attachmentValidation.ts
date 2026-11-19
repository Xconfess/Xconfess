/**
 * Client-side attachment validation.
 *
 * This is a UX convenience (fast, actionable feedback before uploading).
 * It is NOT a security boundary: the backend re-validates every upload and
 * remains the source of truth. Keep the two constants below aligned with the
 * backend policy (MAX_FILE_SIZE_BYTES and ALLOWED_MIME_TYPES).
 */

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
];

export interface AttachmentPolicy {
  maxSizeBytes: number;
  allowedMimeTypes: readonly string[];
}

export const DEFAULT_ATTACHMENT_POLICY: AttachmentPolicy = {
  maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
  allowedMimeTypes: ALLOWED_ATTACHMENT_MIME_TYPES,
};

/** The minimum a file needs to be validated. A browser `File` satisfies this. */
export interface AttachmentLike {
  name: string;
  size: number;
  type: string;
}

export type AttachmentValidationCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'MISSING_TYPE'
  | 'UNSUPPORTED_TYPE';

export interface AttachmentValidationError {
  code: AttachmentValidationCode;
  message: string;
}

export interface AttachmentValidationResult {
  valid: boolean;
  errors: AttachmentValidationError[];
}

const FRIENDLY_TYPE_NAMES: Readonly<Partial<Record<string, string>>> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'application/pdf': 'PDF',
  'text/plain': 'plain text',
};

/** Lower-cases and strips parameters, e.g. "IMAGE/PNG; charset=x" -> "image/png". */
export function normalizeMimeType(type: string | null | undefined): string {
  return (type ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/** Human readable size, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${Number(value.toFixed(2))} ${units[index] ?? 'GB'}`;
}

function describeAllowedTypes(policy: AttachmentPolicy): string {
  return policy.allowedMimeTypes
    .map((type) => {
      const normalized = normalizeMimeType(type);
      return FRIENDLY_TYPE_NAMES[normalized] ?? normalized;
    })
    .join(', ');
}

export function validateAttachment(
  file: AttachmentLike,
  policy: AttachmentPolicy = DEFAULT_ATTACHMENT_POLICY,
): AttachmentValidationResult {
  const errors: AttachmentValidationError[] = [];
  const trimmedName = file.name.trim();
  const label = trimmedName ? `"${trimmedName}"` : 'This file';

  if (file.size <= 0) {
    errors.push({
      code: 'EMPTY_FILE',
      message: `${label} is empty. Choose a file that has content.`,
    });
  } else if (file.size > policy.maxSizeBytes) {
    errors.push({
      code: 'FILE_TOO_LARGE',
      message: `${label} is ${formatBytes(file.size)}, which is over the ${formatBytes(
        policy.maxSizeBytes,
      )} limit. Choose a smaller file or compress it before uploading.`,
    });
  }

  const mimeType = normalizeMimeType(file.type);
  const allowed = policy.allowedMimeTypes.map(normalizeMimeType);

  if (!mimeType) {
    errors.push({
      code: 'MISSING_TYPE',
      message: `We could not tell what type of file ${label} is. Please choose one of these types: ${describeAllowedTypes(
        policy,
      )}.`,
    });
  } else if (!allowed.includes(mimeType)) {
    errors.push({
      code: 'UNSUPPORTED_TYPE',
      message: `${label} has an unsupported file type (${mimeType}). Please choose one of these types: ${describeAllowedTypes(
        policy,
      )}.`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/** Validate many files at once and split them into accepted / rejected. */
export function validateAttachments<T extends AttachmentLike>(
  files: readonly T[],
  policy: AttachmentPolicy = DEFAULT_ATTACHMENT_POLICY,
): { accepted: T[]; rejected: Array<{ file: T; errors: AttachmentValidationError[] }> } {
  const accepted: T[] = [];
  const rejected: Array<{ file: T; errors: AttachmentValidationError[] }> = [];

  for (const file of files) {
    const result = validateAttachment(file, policy);
    if (result.valid) {
      accepted.push(file);
    } else {
      rejected.push({ file, errors: result.errors });
    }
  }

  return { accepted, rejected };
}

export type ValidatedUploadOutcome<R> =
  | { ok: true; result: R }
  | { ok: false; errors: AttachmentValidationError[] };

/**
 * Runs `upload` only if the file passes validation. Invalid files never reach
 * the network. The server still validates independently.
 */
export async function uploadIfValid<F extends AttachmentLike, R>(
  file: F,
  upload: (file: F) => Promise<R>,
  policy: AttachmentPolicy = DEFAULT_ATTACHMENT_POLICY,
): Promise<ValidatedUploadOutcome<R>> {
  const validation = validateAttachment(file, policy);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }
  return { ok: true, result: await upload(file) };
}