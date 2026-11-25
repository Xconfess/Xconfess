import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttachmentCleanupService,
  DeletedMessageCleanupResult,
} from './attachment-cleanup.service';
import { AttachmentRepository } from './repository/attachment.repository';
import {
  Attachment,
  AttachmentStatus,
  AttachmentType,
} from './entities/attachment.entity';

/**
 * Issue #2124 — regression suite for the deleted-message attachment
 * cleanup. The underlying repository calls are stubbed; the assertions
 * focus on the service's control flow:
 *
 *   - identify attachments whose referenced message is gone;
 *   - preserve rows still linked to a confession (null out messageId
 *     instead of deleting);
 *   - mark + delete orphans with no remaining reference;
 *   - continue on per-row failure and report it in `errors`;
 *   - repeated runs do not double-process already-cleaned rows.
 */

function buildAttachment(overrides: Partial<Attachment>): Attachment {
  return {
    id: overrides.id ?? 'att-1',
    objectKey: 'anon/u1/key',
    originalName: 'photo.png',
    size: 1234,
    mimeType: 'image/png',
    type: AttachmentType.IMAGE,
    status: AttachmentStatus.COMPLETED,
    checksum: null,
    metadata: null,
    anonymousUser: null,
    anonymousUserId: null,
    confessionId: null,
    messageId: 42,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: new Date('2026-01-01T00:00:00Z'),
    failedAt: null,
    failureReason: null,
    ...overrides,
  } as Attachment;
}

describe('AttachmentCleanupService.cleanupAttachmentsForDeletedMessages (Issue #2124)', () => {
  let service: AttachmentCleanupService;
  let repo: {
    findAttachmentsForDeletedMessages: jest.Mock;
    clearMessageReference: jest.Mock;
    markAsAbandoned: jest.Mock;
    deleteAbandonedAttachments: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findAttachmentsForDeletedMessages: jest.fn(),
      clearMessageReference: jest.fn(),
      markAsAbandoned: jest.fn(),
      deleteAbandonedAttachments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentCleanupService,
        { provide: AttachmentRepository, useValue: repo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'ATTACHMENT_CLEANUP_BATCH_SIZE') return 100;
              if (key === 'ATTACHMENT_CLEANUP_GRACE_PERIOD_MS') return 1000;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get(AttachmentCleanupService);
  });

  it('is a no-op when no attachments reference a deleted message', async () => {
    repo.findAttachmentsForDeletedMessages.mockResolvedValue([]);

    const result = await service.cleanupAttachmentsForDeletedMessages();

    expect(result).toEqual<DeletedMessageCleanupResult>({
      scanned: 0,
      detachedCount: 0,
      abandonedCount: 0,
      deletedCount: 0,
      errors: [],
    });
    expect(repo.clearMessageReference).not.toHaveBeenCalled();
    expect(repo.markAsAbandoned).not.toHaveBeenCalled();
    expect(repo.deleteAbandonedAttachments).not.toHaveBeenCalled();
  });

  it('detaches attachments still referenced by a confession (messageId cleared, row kept)', async () => {
    const confessed = buildAttachment({ id: 'att-c', confessionId: 'conf-1' });
    repo.findAttachmentsForDeletedMessages.mockResolvedValue([confessed]);
    repo.clearMessageReference.mockResolvedValue(1);

    const result = await service.cleanupAttachmentsForDeletedMessages();

    expect(repo.clearMessageReference).toHaveBeenCalledWith('att-c');
    expect(repo.markAsAbandoned).not.toHaveBeenCalled();
    expect(repo.deleteAbandonedAttachments).not.toHaveBeenCalled();
    expect(result.scanned).toBe(1);
    expect(result.detachedCount).toBe(1);
    expect(result.abandonedCount).toBe(0);
    expect(result.deletedCount).toBe(0);
  });

  it('marks abandoned and deletes orphans with no remaining reference', async () => {
    const orphans = [
      buildAttachment({ id: 'att-a' }),
      buildAttachment({ id: 'att-b' }),
    ];
    repo.findAttachmentsForDeletedMessages.mockResolvedValue(orphans);
    repo.markAsAbandoned.mockResolvedValue(2);
    repo.deleteAbandonedAttachments.mockResolvedValue(2);

    const result = await service.cleanupAttachmentsForDeletedMessages();

    expect(repo.clearMessageReference).not.toHaveBeenCalled();
    expect(repo.markAsAbandoned).toHaveBeenCalledWith(['att-a', 'att-b']);
    expect(repo.deleteAbandonedAttachments).toHaveBeenCalledWith(['att-a', 'att-b']);
    expect(result.scanned).toBe(2);
    expect(result.detachedCount).toBe(0);
    expect(result.abandonedCount).toBe(2);
    expect(result.deletedCount).toBe(2);
  });

  it('continues the sweep when a per-row detach throws, and reports the failure', async () => {
    const confessed = buildAttachment({ id: 'att-c', confessionId: 'conf-1' });
    const broken = buildAttachment({ id: 'att-x', confessionId: 'conf-2' });
    const orphan = buildAttachment({ id: 'att-o' });
    repo.findAttachmentsForDeletedMessages.mockResolvedValue([
      confessed,
      broken,
      orphan,
    ]);
    repo.clearMessageReference
      .mockResolvedValueOnce(1) // att-c succeeds
      .mockRejectedValueOnce(new Error('transient db error')); // att-x fails
    repo.markAsAbandoned.mockResolvedValue(1);
    repo.deleteAbandonedAttachments.mockResolvedValue(1);

    const result = await service.cleanupAttachmentsForDeletedMessages();

    expect(result.scanned).toBe(3);
    expect(result.detachedCount).toBe(1);
    expect(result.abandonedCount).toBe(1);
    expect(result.deletedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('att-x');
    expect(result.errors[0]).toContain('transient db error');
  });

  it('reports abandon-batch failure without crashing the delete step', async () => {
    const orphan = buildAttachment({ id: 'att-o' });
    repo.findAttachmentsForDeletedMessages.mockResolvedValue([orphan]);
    repo.markAsAbandoned.mockRejectedValue(new Error('deadlock'));
    repo.deleteAbandonedAttachments.mockResolvedValue(0);

    const result = await service.cleanupAttachmentsForDeletedMessages();

    expect(result.abandonedCount).toBe(0);
    expect(result.errors.some((e) => e.includes('mark-abandoned'))).toBe(true);
    // delete call still runs — idempotent, only hits already-ABANDONED rows.
    expect(repo.deleteAbandonedAttachments).toHaveBeenCalledWith(['att-o']);
  });

  it('is idempotent across repeated runs (nothing left to do after cleanup)', async () => {
    const orphan = buildAttachment({ id: 'att-o' });
    repo.findAttachmentsForDeletedMessages
      .mockResolvedValueOnce([orphan]) // first run: there is work
      .mockResolvedValueOnce([]); // second run: nothing left
    repo.markAsAbandoned.mockResolvedValue(1);
    repo.deleteAbandonedAttachments.mockResolvedValue(1);

    const first = await service.cleanupAttachmentsForDeletedMessages();
    const second = await service.cleanupAttachmentsForDeletedMessages();

    expect(first.deletedCount).toBe(1);
    expect(second.scanned).toBe(0);
    expect(second.deletedCount).toBe(0);
    expect(second.errors).toHaveLength(0);
  });

  it('resumes safely after a prior partial failure (second run picks up what the first missed)', async () => {
    const orphanA = buildAttachment({ id: 'att-a' });
    const orphanB = buildAttachment({ id: 'att-b' });
    repo.findAttachmentsForDeletedMessages
      .mockResolvedValueOnce([orphanA, orphanB])
      // After the first run: abandon succeeded but delete failed, so
      // only `att-b` remains as the un-deleted candidate on the next
      // scan. (Mark-as-abandoned filters by status != ABANDONED, delete
      // filters by status == ABANDONED — both naturally idempotent.)
      .mockResolvedValueOnce([orphanB]);
    repo.markAsAbandoned
      .mockResolvedValueOnce(2) // first run: both marked
      .mockResolvedValueOnce(0); // second run: nothing to re-mark
    repo.deleteAbandonedAttachments
      .mockResolvedValueOnce(1) // first run: only one deleted
      .mockResolvedValueOnce(1); // second run: the remaining one deleted

    const first = await service.cleanupAttachmentsForDeletedMessages();
    const second = await service.cleanupAttachmentsForDeletedMessages();

    expect(first.abandonedCount).toBe(2);
    expect(first.deletedCount).toBe(1);
    expect(second.abandonedCount).toBe(0);
    expect(second.deletedCount).toBe(1);
  });

  it('reports a candidate-scan failure without throwing', async () => {
    repo.findAttachmentsForDeletedMessages.mockRejectedValue(
      new Error('scan unavailable'),
    );

    const result = await service.cleanupAttachmentsForDeletedMessages();

    expect(result.scanned).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('candidate scan failed');
    expect(repo.markAsAbandoned).not.toHaveBeenCalled();
  });
});
