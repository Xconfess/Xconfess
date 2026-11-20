import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateAttachmentDto } from './dto/attachment.dto';

/**
 * Centralised pre-storage validation for attachment metadata (Issue #2123).
 *
 * Every call to `POST /attachments` passes through `validateCreate` before
 * any storage-adjacent record is written. The service answers three
 * questions:
 *
 *   1. Is the client-declared size within the configured ceiling?
 *   2. Is the client-declared MIME type in the configured allowlist?
 *   3. Does the file extension on `originalName` match the claimed MIME,
 *      i.e. is the client telling a consistent story about the file?
 *
 * The third check is what the acceptance criterion
 * "do not trust client-provided MIME metadata alone" reduces to for a
 * pre-signed / direct-to-storage upload flow where the backend never sees
 * the file bytes: it does not prove a png is really a png, but it does
 * stop a trivial MIME forgery (upload.exe claiming to be image/png) from
 * reaching the storage layer. A later stage (integrity service, scanner)
 * can perform magic-byte verification once the bytes are committed.
 *
 * Errors are raised as `BadRequestException` with a structured message
 * that names the offending field and reason but never references
 * `objectKey`, so a leaked error cannot be used to probe the storage
 * layout.
 */
@Injectable()
export class AttachmentValidationService {
  private readonly logger = new Logger(AttachmentValidationService.name);

  /**
   * Conservative extension → MIME map. Lowercase keys and values. One
   * extension may have multiple acceptable MIMEs (jpeg's canonical type
   * is `image/jpeg`, but `.jpg` is also widely served as `image/pjpeg`
   * from legacy tooling, so treat them as equivalent). An extension not
   * in this map is rejected as "unsupported" rather than treated as
   * "unknown but maybe fine".
   */
  private static readonly EXTENSION_MIME_MAP: Record<string, string[]> = {
    '.jpg': ['image/jpeg', 'image/pjpeg'],
    '.jpeg': ['image/jpeg', 'image/pjpeg'],
    '.png': ['image/png'],
    '.gif': ['image/gif'],
    '.webp': ['image/webp'],
    '.pdf': ['application/pdf'],
    '.mp4': ['video/mp4'],
    '.mov': ['video/quicktime'],
    '.mp3': ['audio/mpeg', 'audio/mp3'],
    '.wav': ['audio/wav', 'audio/x-wav'],
  };

  private static readonly DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
  private static readonly DEFAULT_ALLOWED_MIME_TYPES: string[] = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ];

  constructor(private readonly configService: ConfigService) {}

  validateCreate(dto: CreateAttachmentDto): void {
    this.checkSize(dto.size);
    const normalizedMime = this.normalizeMime(dto.mimeType);
    this.checkMimeType(normalizedMime);
    this.checkExtensionMatchesMime(dto.originalName, normalizedMime);
  }

  private getMaxSizeBytes(): number {
    const configured = this.configService.get<number>('attachment.maxSizeBytes');
    if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
      return Math.floor(configured);
    }
    return AttachmentValidationService.DEFAULT_MAX_SIZE_BYTES;
  }

  private getAllowedMimeTypes(): string[] {
    const configured = this.configService.get<string[]>('attachment.allowedMimeTypes');
    if (Array.isArray(configured) && configured.length > 0) {
      return configured.map((m) => m.toLowerCase());
    }
    return AttachmentValidationService.DEFAULT_ALLOWED_MIME_TYPES;
  }

  private normalizeMime(mimeType: string | undefined | null): string {
    return (mimeType ?? '').trim().toLowerCase();
  }

  private checkSize(size: number | undefined | null): void {
    if (size === undefined || size === null || Number.isNaN(size)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AttachmentValidation',
        field: 'size',
        message: 'Attachment size is required.',
      });
    }
    if (size <= 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AttachmentValidation',
        field: 'size',
        message: 'Attachment must be a non-empty file.',
      });
    }
    const max = this.getMaxSizeBytes();
    if (size > max) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AttachmentValidation',
        field: 'size',
        message: `Attachment exceeds the maximum allowed size of ${max} bytes.`,
        maxSizeBytes: max,
      });
    }
  }

  private checkMimeType(mime: string): void {
    if (!mime) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AttachmentValidation',
        field: 'mimeType',
        message: 'Attachment MIME type is required.',
      });
    }
    const allowed = this.getAllowedMimeTypes();
    if (!allowed.includes(mime)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AttachmentValidation',
        field: 'mimeType',
        message: 'Attachment MIME type is not supported.',
        allowedMimeTypes: allowed,
      });
    }
  }

  private checkExtensionMatchesMime(originalName: string, mime: string): void {
    const ext = this.extractExtension(originalName);
    if (!ext) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AttachmentValidation',
        field: 'originalName',
        message: 'Attachment file name must include a recognised extension.',
      });
    }
    const expected = AttachmentValidationService.EXTENSION_MIME_MAP[ext];
    if (!expected) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AttachmentValidation',
        field: 'originalName',
        message: `Attachment extension "${ext}" is not supported.`,
      });
    }
    if (!expected.includes(mime)) {
      // Intentional: do not echo the offending `objectKey` in the error
      // body; the client knows the name it submitted but the storage
      // layout stays opaque.
      throw new BadRequestException({
        statusCode: 400,
        error: 'AttachmentValidation',
        field: 'mimeType',
        message:
          'Attachment MIME type does not match the file extension on originalName.',
      });
    }
  }

  private extractExtension(name: string): string | null {
    if (!name) return null;
    const trimmed = name.trim();
    const dot = trimmed.lastIndexOf('.');
    if (dot < 0 || dot === trimmed.length - 1) return null;
    return trimmed.slice(dot).toLowerCase();
  }
}
