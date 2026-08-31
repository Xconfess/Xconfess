import { BadRequestException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileAttachment {
  /** Original filename from the client (may contain path traversal attempts). */
  originalName: string;
  /** Declared MIME type (client-provided, should be verified via magic bytes). */
  mimeType: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Optional metadata for image dimensions, duration, etc. */
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  sanitized: FileAttachment;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]);

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const SUSPICIOUS_MIME_PATTERNS = [
  /text\/html/i,
  /application\/x-javascript/i,
  /application\/javascript/i,
  /application\/ecmascript/i,
  /text\/javascript/i,
  /image\/svg\+xml/i, // SVG can contain scripts
];

const INVALID_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

function hasInvalidFilenameChar(char: string): boolean {
  return INVALID_FILENAME_CHARS.has(char) || char.charCodeAt(0) < 32;
}

// ---------------------------------------------------------------------------
// Magic bytes: quick content-type verification via file header
// ---------------------------------------------------------------------------

const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
  { mime: 'text/plain', bytes: [], offset: 0 }, // no magic bytes — rely on MIME
];

/**
 * Quick content-type verification using magic bytes.
 * Returns true if the file header matches the declared MIME type.
 * Skips validation for types without magic bytes (e.g., text/plain).
 */
export function matchesMagicBytes(mimeType: string, fileBuffer: Buffer): boolean {
  const entry = MAGIC_BYTES.find((m) => m.mime === mimeType);
  if (!entry || entry.bytes.length === 0) return true; // no magic bytes to match
  if (fileBuffer.length < entry.offset + entry.bytes.length) return false;
  return entry.bytes.every((byte, i) => fileBuffer[entry.offset + i] === byte);
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Strip path separators and null bytes from a filename to prevent
 * directory traversal attacks.
 */
export function sanitizeFileName(filename: string): string {
  const sanitized = filename
    .split('')
    .map((char) => (hasInvalidFilenameChar(char) ? '_' : char))
    .join('')
    .replace(/\.\./g, '_')
    .replace(/^\.+/g, '')
    .trim()
    .slice(0, 255);

  return /[A-Za-z0-9]/.test(sanitized) ? sanitized : '';
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

/**
 * Validates file attachment metadata before persistence.
 * Checks:
 * - Filename safety (no path traversal, no null bytes, max 255 chars)
 * - MIME type is in the allowed list (not executable, not HTML/SVG)
 * - File size is within the configured limit
 * - Optional magic-byte content verification
 *
 * Returns a validated + sanitized FileAttachment with any errors collected.
 * Throws BadRequestException for invalid state; returns result with errors
 * for soft-failure scenarios.
 */
export function validateFileAttachment(
  attachment: FileAttachment,
  fileBuffer?: Buffer,
): ValidationResult {
  const errors: string[] = [];
  const sanitized: FileAttachment = {
    originalName: sanitizeFileName(attachment.originalName),
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    metadata: attachment.metadata,
  };

  // 1. Validate filename is not empty after sanitization
  if (!sanitized.originalName) {
    errors.push('Filename is empty or contains only invalid characters');
  }

  // 2. Validate MIME type
  const lowerMime = sanitized.mimeType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(lowerMime)) {
    errors.push(`File type "${sanitized.mimeType}" is not allowed`);
  }

  // 3. Block dangerous MIME types explicitly
  if (SUSPICIOUS_MIME_PATTERNS.some((p) => p.test(lowerMime))) {
    errors.push(`File type "${sanitized.mimeType}" is not permitted`);
  }

  // 4. Validate file size
  if (sanitized.sizeBytes <= 0) {
    errors.push('File size must be greater than zero');
  }
  if (sanitized.sizeBytes > MAX_FILE_SIZE_BYTES) {
    errors.push(`File size exceeds the maximum allowed (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`);
  }

  // 5. Optional magic-byte content verification
  if (fileBuffer && sanitized.mimeType && !matchesMagicBytes(lowerMime, fileBuffer)) {
    errors.push('File content does not match the declared file type');
  }

  // 6. Validate optional metadata fields
  if (sanitized.metadata) {
    for (const [key, value] of Object.entries(sanitized.metadata)) {
      if (typeof value === 'string' && value.length > 500) {
        errors.push(`Metadata field "${key}" exceeds maximum length (500 chars)`);
      }
    }
  }

  return { valid: errors.length === 0, sanitized, errors };
}

/**
 * Validates and throws on first error — for use in NestJS pipes/controllers.
 */
export function validateFileAttachmentOrThrow(
  attachment: FileAttachment,
  fileBuffer?: Buffer,
): FileAttachment {
  const result = validateFileAttachment(attachment, fileBuffer);
  if (!result.valid) {
    throw new BadRequestException({
      message: 'File attachment validation failed',
      errors: result.errors,
    });
  }
  return result.sanitized;
}
