import { NotFoundException } from '@nestjs/common';
import { AttachmentIntegrityService } from './attachment-integrity.service';
import { Attachment, AttachmentStatus, AttachmentType } from './entities/attachment.entity';

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'attach-1',
    objectKey: 'private/objects/attach-1.bin',
    originalName: 'photo.png',
    size: 1024 as any,
    mimeType: 'image/png',
    type: AttachmentType.IMAGE,
    status: AttachmentStatus.COMPLETED,
    checksum: null,
    metadata: null,
    anonymousUser: null,
    anonymousUserId: 'anon-1',
    confessionId: null,
    messageId: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: new Date('2026-01-01T00:05:00Z'),
    failedAt: null,
    failureReason: null,
    ...overrides,
  } as Attachment;
}

describe('AttachmentIntegrityService', () => {
  let service: AttachmentIntegrityService;

  beforeEach(() => {
    service = new AttachmentIntegrityService();
  });

  it('returns a sanitized DTO for a valid, owned, completed attachment', () => {
    const attachment = makeAttachment();
    const dto = service.assertServableAndSanitize(attachment, ['anon-1']);

    expect(dto.id).toBe('attach-1');
    expect(dto.size).toBe(1024);
    expect((dto as any).objectKey).toBeUndefined();
  });

  it('rejects when the attachment does not exist', () => {
    expect(() => service.assertServableAndSanitize(null, ['anon-1'])).toThrow(NotFoundException);
  });

  it('rejects when the requester does not own the attachment', () => {
    const attachment = makeAttachment({ anonymousUserId: 'anon-2' });
    expect(() => service.assertServableAndSanitize(attachment, ['anon-1'])).toThrow(NotFoundException);
  });

  it('rejects when the attachment has no owner at all', () => {
    const attachment = makeAttachment({ anonymousUserId: null });
    expect(() => service.assertServableAndSanitize(attachment, ['anon-1'])).toThrow(NotFoundException);
  });

  it('rejects when objectKey is missing', () => {
    const attachment = makeAttachment({ objectKey: '' as any });
    expect(() => service.assertServableAndSanitize(attachment, ['anon-1'])).toThrow(NotFoundException);
  });

  it('rejects when size is zero or negative', () => {
    const attachment = makeAttachment({ size: 0 as any });
    expect(() => service.assertServableAndSanitize(attachment, ['anon-1'])).toThrow(NotFoundException);
  });

  it('rejects when mimeType is missing', () => {
    const attachment = makeAttachment({ mimeType: '' as any });
    expect(() => service.assertServableAndSanitize(attachment, ['anon-1'])).toThrow(NotFoundException);
  });

  it('rejects when status is not COMPLETED', () => {
    const attachment = makeAttachment({ status: AttachmentStatus.UPLOADING });
    expect(() => service.assertServableAndSanitize(attachment, ['anon-1'])).toThrow(NotFoundException);
  });

  it('rejects a COMPLETED record with no completedAt timestamp', () => {
    const attachment = makeAttachment({ completedAt: null });
    expect(() => service.assertServableAndSanitize(attachment, ['anon-1'])).toThrow(NotFoundException);
  });

  it('never leaks the objectKey in the rejection error', () => {
    const attachment = makeAttachment({ anonymousUserId: 'anon-2', objectKey: 'super-secret-key' });
    try {
      service.assertServableAndSanitize(attachment, ['anon-1']);
      fail('expected to throw');
    } catch (err: any) {
      expect(JSON.stringify(err.getResponse())).not.toContain('super-secret-key');
    }
  });
});
