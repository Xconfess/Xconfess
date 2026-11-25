import { registerAs } from '@nestjs/config';

/**
 * Attachment-module configuration (Issue #2123).
 *
 * Access via ConfigService:
 *   this.configService.get<number>('attachment.maxSizeBytes');
 *   this.configService.get<string[]>('attachment.allowedMimeTypes');
 *
 * These values gate every `POST /attachments` call: a request whose
 * client-declared `size` exceeds `maxSizeBytes` is rejected before any
 * storage record is written, and a request whose `mimeType` is not in
 * `allowedMimeTypes` is rejected for the same reason. The file extension
 * on `originalName` is cross-checked against the claimed MIME via a
 * conservative map so a client that lies about one of the two cannot
 * slip an unsupported file through — see `AttachmentValidationService`.
 */
export default registerAs('attachment', () => {
  const defaultMime = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ].join(',');

  return {
    // 10 MiB default — chosen to match a typical reverse-proxy
    // `client_max_body_size` so a request that passes this check is also
    // deliverable to the upstream object store.
    maxSizeBytes: parseInt(
      process.env.ATTACHMENT_MAX_SIZE_BYTES ?? String(10 * 1024 * 1024),
      10,
    ),
    allowedMimeTypes: (process.env.ATTACHMENT_ALLOWED_MIME_TYPES ?? defaultMime)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
});
