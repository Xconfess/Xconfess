import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentValidationService } from './attachment-validation.service';
import { CreateAttachmentDto } from './dto/attachment.dto';

/**
 * Issue #2123 — regression suite for the centralised attachment metadata
 * validation. Exercises every acceptance-criteria case:
 *   - Empty upload rejected (size <= 0).
 *   - Oversized upload rejected (size > ATTACHMENT_MAX_SIZE_BYTES).
 *   - Unsupported MIME rejected.
 *   - Extension / MIME mismatch rejected (the "don't trust client MIME
 *     metadata alone" defence).
 *   - Storage path (`objectKey`) never appears in the error body.
 *   - Well-formed metadata passes.
 */

function buildValidDto(overrides: Partial<CreateAttachmentDto> = {}): CreateAttachmentDto {
  return {
    objectKey: 'anon/u1/2026-11-20/secret-filename.png',
    originalName: 'photo.png',
    size: 123_456,
    mimeType: 'image/png',
    ...overrides,
  } as CreateAttachmentDto;
}

describe('AttachmentValidationService (Issue #2123)', () => {
  let service: AttachmentValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentValidationService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'attachment.maxSizeBytes') return 1_000_000;
              if (key === 'attachment.allowedMimeTypes') {
                return ['image/jpeg', 'image/png', 'application/pdf'];
              }
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(AttachmentValidationService);
  });

  it('accepts a well-formed PNG upload within the configured size cap', () => {
    expect(() => service.validateCreate(buildValidDto())).not.toThrow();
  });

  it('rejects an empty upload (size = 0)', () => {
    try {
      service.validateCreate(buildValidDto({ size: 0 }));
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as any;
      expect(body.field).toBe('size');
      expect(body.error).toBe('AttachmentValidation');
      expect(JSON.stringify(body)).not.toContain('secret-filename');
    }
  });

  it('rejects an oversized upload', () => {
    try {
      service.validateCreate(buildValidDto({ size: 5_000_000 }));
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as any;
      expect(body.field).toBe('size');
      expect(body.maxSizeBytes).toBe(1_000_000);
      expect(JSON.stringify(body)).not.toContain('secret-filename');
    }
  });

  it('rejects an unsupported MIME type', () => {
    try {
      service.validateCreate(
        buildValidDto({ mimeType: 'application/x-msdownload', originalName: 'thing.exe' }),
      );
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as any;
      expect(body.field).toBe('mimeType');
      expect(JSON.stringify(body)).not.toContain('secret-filename');
    }
  });

  it('rejects a MIME / extension mismatch (client lies about MIME)', () => {
    // originalName is a .exe but client claims image/png so the MIME
    // passes the allowlist alone. The extension-vs-MIME cross-check is
    // the Issue #2123 "don't trust client MIME alone" defence.
    try {
      service.validateCreate(buildValidDto({ originalName: 'bad.exe', mimeType: 'image/png' }));
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as any;
      // The precise field surfaced depends on which branch fires first;
      // either "originalName" (unsupported extension) or "mimeType"
      // (MIME does not match extension) is a correct rejection.
      expect(['originalName', 'mimeType']).toContain(body.field);
      expect(JSON.stringify(body)).not.toContain('secret-filename');
    }
  });

  it('rejects a file with no extension', () => {
    expect(() =>
      service.validateCreate(buildValidDto({ originalName: 'nameonly', mimeType: 'image/png' })),
    ).toThrow(BadRequestException);
  });

  it('composes the MIME allowlist with the extension map', () => {
    // image/pjpeg is a legacy jpeg alias recognised by the extension map
    // for .jpg, but the MIME allowlist in this test env only contains
    // canonical image/jpeg, so the upload is still rejected at the
    // allowlist stage. This confirms the two checks compose rather than
    // short-circuiting each other — the extension map is defence in
    // depth, not an escape hatch around the allowlist.
    expect(() =>
      service.validateCreate(
        buildValidDto({ originalName: 'photo.jpg', mimeType: 'image/pjpeg' }),
      ),
    ).toThrow(BadRequestException);
  });

  it('falls back to safe defaults when ConfigService returns undefined', async () => {
    const barebones: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentValidationService,
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
      ],
    }).compile();
    const svc = barebones.get(AttachmentValidationService);
    // 10 MiB + 1 is over the default cap.
    expect(() =>
      svc.validateCreate(buildValidDto({ size: 10 * 1024 * 1024 + 1 })),
    ).toThrow(BadRequestException);
    // image/png is in the default allowlist.
    expect(() => svc.validateCreate(buildValidDto({ size: 1024 }))).not.toThrow();
  });
});
