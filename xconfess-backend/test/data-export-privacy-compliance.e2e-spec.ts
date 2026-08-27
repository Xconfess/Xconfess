/**
 * Issue #1080: end-to-end data export privacy compliance suite.
 *
 * The suite drives DataExportService through realistic linked repository data
 * so regressions point at the exact privacy rule that leaked content.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataExportService } from '../src/data-export/data-export.service';
import { ExportRequest } from '../src/data-export/entities/export-request.entity';

type MockRepository = {
  create?: jest.Mock;
  save?: jest.Mock;
  findOne?: jest.Mock;
  update?: jest.Mock;
  createQueryBuilder?: jest.Mock;
  manager?: {
    getRepository: jest.Mock;
  };
};

type ServiceHarness = {
  service: DataExportService;
  exportRepository: MockRepository;
  exportQueue: { add: jest.Mock };
  auditLogService: { logExportLifecycleEvent: jest.Mock };
  configService: { get: jest.Mock };
};

const activeUser = {
  id: 'user-active-1',
  username: 'privacy-tester',
  email: 'privacy-compliance@example.com',
  is_active: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

const deactivatedUser = {
  id: 'user-deactivated-1',
  username: 'former-member',
  email: 'former-member@example.com',
  is_active: false,
  createdAt: new Date('2023-06-01T00:00:00.000Z'),
};

const confessionOne = {
  id: 'confession-active-1',
  message: 'This active confession is safe to export.',
  gender: 'prefer_not_to_say',
  isDeleted: false,
  deletedAt: null,
  isHidden: false,
  moderationStatus: 'approved',
  moderationScore: 0.05,
  moderationFlags: [],
  created_at: new Date('2024-02-15T10:00:00.000Z'),
  view_count: 42,
  isAnchored: true,
  stellarTxHash: 'stellar-tx-safe-metadata',
};

const deletedConfession = {
  id: 'confession-deleted-1',
  message: 'Private deleted confession that must never leak.',
  gender: 'female',
  isDeleted: true,
  deletedAt: new Date('2024-02-20T10:00:00.000Z'),
  isHidden: false,
  moderationStatus: 'approved',
  created_at: new Date('2024-02-15T10:00:00.000Z'),
  view_count: 7,
  isAnchored: false,
};

const moderatedConfession = {
  id: 'confession-moderated-1',
  message: 'Moderated content that must be masked.',
  gender: 'male',
  isDeleted: false,
  deletedAt: null,
  isHidden: false,
  moderationStatus: 'rejected',
  moderationScore: 0.95,
  moderationFlags: ['harassment', 'spam'],
  created_at: new Date('2024-02-16T10:00:00.000Z'),
  view_count: 3,
  isAnchored: false,
};

const hiddenConfession = {
  id: 'confession-hidden-1',
  message: 'Hidden content awaiting moderation review.',
  gender: 'non_binary',
  isDeleted: false,
  deletedAt: null,
  isHidden: true,
  moderationStatus: 'pending_review',
  moderationScore: 0.84,
  moderationFlags: ['self_harm'],
  created_at: new Date('2024-02-17T10:00:00.000Z'),
  view_count: 1,
  isAnchored: false,
};

const activeComment = {
  id: 501,
  content: 'This comment is safe to export.',
  isDeleted: false,
  createdAt: new Date('2024-02-18T10:00:00.000Z'),
  confession: confessionOne,
  parentId: null,
};

const deletedComment = {
  id: 502,
  content: 'Deleted comment content that must never leak.',
  isDeleted: true,
  createdAt: new Date('2024-02-18T11:00:00.000Z'),
  confession: confessionOne,
  parentId: 501,
};

const activeMessage = {
  id: 701,
  content: 'Private message that belongs to the active account.',
  replyContent: null,
  createdAt: new Date('2024-02-19T10:00:00.000Z'),
  repliedAt: null,
  confession: confessionOne,
};

const repliedMessage = {
  id: 702,
  content: 'Private message with a reply.',
  replyContent: 'Reply that should export only for active users.',
  createdAt: new Date('2024-02-19T11:00:00.000Z'),
  repliedAt: new Date('2024-02-19T12:00:00.000Z'),
  confession: confessionOne,
};

const createQueryBuilderReturning = <T>(rows: T[]) => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(rows),
});

const createExportRepository = (
  user = activeUser,
  confessions = [confessionOne, deletedConfession, moderatedConfession, hiddenConfession],
  comments = [activeComment, deletedComment],
  messages = [activeMessage, repliedMessage],
): MockRepository => {
  const repositories = {
    User: {
      findOne: jest.fn().mockResolvedValue(user),
    },
    AnonymousConfession: {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilderReturning(confessions)),
    },
    Comment: {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilderReturning(comments)),
    },
    Message: {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilderReturning(messages)),
    },
  };

  return {
    create: jest.fn((attrs) => ({
      id: 'export-request-1',
      ...attrs,
      createdAt: new Date('2024-02-20T10:00:00.000Z'),
    })),
    save: jest.fn(async (request) => request),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 2 }),
    })),
    manager: {
      getRepository: jest.fn((name: keyof typeof repositories) => {
        const repository = repositories[name];
        if (!repository) {
          throw new Error(`Unexpected repository requested: ${String(name)}`);
        }
        return repository;
      }),
    },
  };
};

const createHarness = (
  exportRepository: MockRepository = createExportRepository(),
): ServiceHarness => {
  const exportQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const auditLogService = {
    logExportLifecycleEvent: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'app.backendUrl') return 'https://api.xconfess.test';
      if (key === 'app.appSecret') return 'privacy-test-secret';
      if (key === 'app.exportDownloadTtlMs') return 24 * 60 * 60 * 1000;
      if (key === 'DATA_EXPORT_TTL_MS') return 24 * 60 * 60 * 1000;
      return fallback;
    }),
  };

  return {
    service: new DataExportService(
      exportRepository as never,
      {} as never,
      exportQueue as never,
      configService as never,
      auditLogService as never,
    ),
    exportRepository,
    exportQueue,
    auditLogService,
    configService,
  };
};

const expectPrivacyRule = (
  rule: string,
  received: unknown,
  expected: Record<string, unknown>,
) => {
  try {
    expect(received).toEqual(expect.objectContaining(expected));
  } catch (error) {
    throw new Error(
      `${rule} privacy rule regressed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

describe('Data export privacy compliance suite (issue #1080)', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('realistic linked export compilation', () => {
    it('redacts deleted, moderated, hidden, and deleted-comment content while preserving safe metadata', async () => {
      const { service, exportRepository } = createHarness();

      const exportData = await service.compileUserData(activeUser.id);

      expect(exportRepository.manager?.getRepository).toHaveBeenCalledWith('User');
      expect(exportRepository.manager?.getRepository).toHaveBeenCalledWith(
        'AnonymousConfession',
      );
      expect(exportRepository.manager?.getRepository).toHaveBeenCalledWith('Comment');
      expect(exportRepository.manager?.getRepository).toHaveBeenCalledWith('Message');

      expect(exportData).toEqual(
        expect.objectContaining({
          userId: activeUser.id,
          exportedAt: expect.any(String),
          userStatus: 'active',
          reactions: [],
          _redactionPolicy: expect.objectContaining({
            deletedContentMasked: true,
            moderatedContentMasked: true,
            deactivatedUserContentMasked: false,
          }),
        }),
      );

      const [
        activeExport,
        deletedExport,
        moderatedExport,
        hiddenExport,
      ] = exportData.confessions;
      const [activeCommentExport, deletedCommentExport] = exportData.comments;
      const [messageExport, repliedMessageExport] = exportData.messages;

      expectPrivacyRule('active confession metadata', activeExport, {
        id: confessionOne.id,
        message: confessionOne.message,
        view_count: 42,
        isAnchored: true,
        stellarTxHash: 'stellar-tx-safe-metadata',
        _redacted: false,
      });

      expectPrivacyRule('deleted confession', deletedExport, {
        id: deletedConfession.id,
        message: '[REDACTED: Content was deleted]',
        _redacted: true,
        _reason: 'deleted',
        deletedAt: deletedConfession.deletedAt,
        created_at: deletedConfession.created_at,
      });
      expect(deletedExport.message).not.toContain(deletedConfession.message);

      expectPrivacyRule('moderated confession', moderatedExport, {
        id: moderatedConfession.id,
        message: '[REDACTED: Content was removed by moderation]',
        _redacted: true,
        _reason: 'moderated',
        moderationStatus: 'rejected',
      });
      expect(moderatedExport.metadata).toEqual(
        expect.objectContaining({
          moderationScore: 0.95,
          moderationFlags: ['harassment', 'spam'],
        }),
      );
      expect(moderatedExport.message).not.toContain(moderatedConfession.message);

      expectPrivacyRule('hidden confession', hiddenExport, {
        id: hiddenConfession.id,
        message: '[REDACTED: Content was removed by moderation]',
        _redacted: true,
        _reason: 'moderated',
        moderationStatus: 'pending_review',
      });
      expect(hiddenExport.metadata).toEqual(
        expect.objectContaining({
          moderationScore: 0.84,
          moderationFlags: ['self_harm'],
        }),
      );
      expect(hiddenExport.message).not.toContain(hiddenConfession.message);

      expectPrivacyRule('active comment relationship', activeCommentExport, {
        id: activeComment.id,
        content: activeComment.content,
        confessionId: confessionOne.id,
        parentId: null,
        _redacted: false,
      });

      expectPrivacyRule('deleted comment', deletedCommentExport, {
        id: deletedComment.id,
        content: '[REDACTED: Comment was deleted]',
        confessionId: confessionOne.id,
        _redacted: true,
        _reason: 'deleted',
      });
      expect(deletedCommentExport.content).not.toContain(deletedComment.content);

      expectPrivacyRule('active message relationship', messageExport, {
        id: activeMessage.id,
        content: activeMessage.content,
        replyContent: null,
        confessionId: confessionOne.id,
        _redacted: false,
      });

      expectPrivacyRule('replied message relationship', repliedMessageExport, {
        id: repliedMessage.id,
        content: repliedMessage.content,
        replyContent: repliedMessage.replyContent,
        repliedAt: repliedMessage.repliedAt,
        confessionId: confessionOne.id,
        _redacted: false,
      });
    });

    it('redacts active content for deactivated users without leaking original text', async () => {
      const { service } = createHarness(
        createExportRepository(
          deactivatedUser,
          [confessionOne],
          [activeComment],
          [repliedMessage],
        ),
      );

      const exportData = await service.compileUserData(deactivatedUser.id);

      expect(exportData.userStatus).toBe('deactivated');
      expect(exportData._redactionPolicy.deactivatedUserContentMasked).toBe(true);

      expectPrivacyRule('deactivated user confession', exportData.confessions[0], {
        id: confessionOne.id,
        message: '[REDACTED: User account deactivated]',
        _redacted: true,
        _reason: 'user_deactivated',
      });
      expect(exportData.confessions[0].message).not.toContain(confessionOne.message);

      expectPrivacyRule('deactivated user comment', exportData.comments[0], {
        id: activeComment.id,
        content: '[REDACTED: User account deactivated]',
        confessionId: confessionOne.id,
        _redacted: true,
        _reason: 'user_deactivated',
      });
      expect(exportData.comments[0].content).not.toContain(activeComment.content);

      expectPrivacyRule('deactivated user replied message', exportData.messages[0], {
        id: repliedMessage.id,
        content: '[REDACTED: User account deactivated]',
        replyContent: '[REDACTED: User account deactivated]',
        confessionId: confessionOne.id,
        _redacted: true,
        _reason: 'user_deactivated',
      });
      expect(exportData.messages[0].content).not.toContain(repliedMessage.content);
      expect(exportData.messages[0].replyContent).not.toContain(
        repliedMessage.replyContent,
      );
    });
  });

  describe('export lifecycle and token compliance', () => {
    it('creates an auditable pending export and queues processing once', async () => {
      const exportRepository = createExportRepository();
      exportRepository.findOne = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const { service, exportQueue, auditLogService } = createHarness(exportRepository);

      const result = await service.requestExport(activeUser.id);

      expect(result).toEqual(
        expect.objectContaining({
          requestId: 'export-request-1',
          status: 'PENDING',
          queuedAt: expect.any(Date),
        }),
      );
      expect(exportQueue.add).toHaveBeenCalledWith('process-export', {
        userId: activeUser.id,
        requestId: 'export-request-1',
      });
      expect(auditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'request_created',
          actorType: 'user',
          actorId: activeUser.id,
          requestId: 'export-request-1',
        }),
      );
    });

    it('rejects active and recent exports with clear lifecycle errors', async () => {
      const exportRepository = createExportRepository();
      exportRepository.findOne = jest
        .fn()
        .mockResolvedValueOnce({ id: 'already-processing', status: 'PROCESSING' });
      const { service } = createHarness(exportRepository);

      const activeRequest = service.requestExport(activeUser.id);
      await expect(activeRequest).rejects.toThrow(ConflictException);
      await expect(activeRequest).rejects.toThrow(
        'An export is already in progress',
      );

      exportRepository.findOne = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'recent-export', status: 'READY' });

      const recentRequest = service.requestExport(activeUser.id);
      await expect(recentRequest).rejects.toThrow(BadRequestException);
      await expect(recentRequest).rejects.toThrow(
        'Export allowed once every 7 days',
      );
    });

    it('issues signed download URLs with a persisted one-time token and 24-hour expiry', async () => {
      const now = new Date('2024-02-20T10:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);
      const { service, exportRepository } = createHarness();

      const url = await service.generateSignedDownloadUrl(
        'export-token-1',
        activeUser.id,
      );

      const parsed = new URL(url);
      const expires = Number(parsed.searchParams.get('expires'));
      const token = parsed.searchParams.get('token');

      expect(parsed.origin).toBe('https://api.xconfess.test');
      expect(parsed.pathname).toBe('/api/data-export/download/export-token-1');
      expect(parsed.searchParams.get('userId')).toBe(activeUser.id);
      expect(parsed.searchParams.get('signature')).toEqual(expect.any(String));
      expect(token).toMatch(/^[a-f0-9]{32}$/);
      expect(expires - now.getTime()).toBe(24 * 60 * 60 * 1000);
      expect(exportRepository.update).toHaveBeenCalledWith('export-token-1', {
        downloadToken: token,
      });
    });

    it('consumes valid tokens once and rejects replayed, mismatched, and expired tokens', async () => {
      const requestId = 'export-token-2';
      const token = 'valid-token';
      const createdAt = new Date('2024-02-20T10:00:00.000Z');
      jest.useFakeTimers().setSystemTime(new Date('2024-02-20T11:00:00.000Z'));

      const exportRepository = createExportRepository();
      exportRepository.findOne = jest.fn().mockResolvedValue({
        downloadToken: token,
        downloadedAt: null,
        createdAt,
        status: 'READY',
      });
      const { service } = createHarness(exportRepository);

      await expect(
        service.validateAndConsumeToken(requestId, activeUser.id, token),
      ).resolves.toBe(true);
      expect(exportRepository.update).toHaveBeenCalledWith(
        requestId,
        expect.objectContaining({
          downloadToken: null,
          downloadedAt: expect.any(Date),
        }),
      );

      exportRepository.findOne = jest.fn().mockResolvedValue({
        downloadToken: token,
        downloadedAt: new Date('2024-02-20T11:30:00.000Z'),
        createdAt,
        status: 'READY',
      });
      await expect(
        service.validateAndConsumeToken(requestId, activeUser.id, token),
      ).resolves.toBe(false);

      exportRepository.findOne = jest.fn().mockResolvedValue({
        downloadToken: 'different-token',
        downloadedAt: null,
        createdAt,
        status: 'READY',
      });
      await expect(
        service.validateAndConsumeToken(requestId, activeUser.id, token),
      ).resolves.toBe(false);

      exportRepository.findOne = jest.fn().mockResolvedValue({
        downloadToken: token,
        downloadedAt: null,
        createdAt,
        status: 'READY',
      });
      jest.useFakeTimers().setSystemTime(new Date('2024-02-21T11:00:01.000Z'));

      await expect(
        service.validateAndConsumeToken(requestId, activeUser.id, token),
      ).resolves.toBe(false);
      expect(exportRepository.update).toHaveBeenLastCalledWith(requestId, {
        downloadToken: null,
        expiredAt: expect.any(Date),
      });
    });

    it('expires stale unconsumed tokens for cleanup jobs', async () => {
      const { service } = createHarness();

      await expect(service.expireStaleDownloadTokens()).resolves.toBe(2);
    });
  });

  describe('privacy regression diagnostics', () => {
    it('throws rule-specific failure messages when a redaction assertion fails', () => {
      expect(() =>
        expectPrivacyRule(
          'deleted confession',
          { message: deletedConfession.message },
          { message: '[REDACTED: Content was deleted]' },
        ),
      ).toThrow('deleted confession privacy rule regressed');
    });
  });
});
