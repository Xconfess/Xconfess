import * as crypto from 'crypto';
import { BadRequestException, ConflictException, GoneException } from '@nestjs/common';
import { DataExportService } from './data-export.service';
import { DataExportController } from './data-export.controller';

describe('Data Export Retention & Deletion Lifecycle Invariants (#2229)', () => {
  const secret = 'mock-app-secret-for-retention-lifecycle';
  const backendUrl = 'https://api.xconfess.example';

  const mockConfigService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'app.appSecret') return secret;
      if (key === 'app.backendUrl') return backendUrl;
      if (key === 'app.exportDownloadTtlMs') return 24 * 60 * 60 * 1000;
      if (key === 'ENABLE_BACKGROUND_JOBS') return 'true';
      return fallback;
    }),
  };

  describe('Lifecycle State Transitions & Rate Limiting Guards', () => {
    let service: DataExportService;
    let mockExportRepo: any;
    let mockChunkRepo: any;
    let mockQueue: any;
    let mockAuditLogService: any;

    beforeEach(() => {
      mockExportRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn((dto) => ({ id: 'exp-uuid-1', ...dto })),
        save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockChunkRepo = {
        findOne: jest.fn(),
        count: jest.fn(),
      };
      mockQueue = {
        add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      };
      mockAuditLogService = {
        logExportLifecycleEvent: jest.fn().mockResolvedValue(undefined),
      };

      service = new DataExportService(
        mockExportRepo,
        mockChunkRepo,
        mockQueue,
        mockConfigService as any,
        mockAuditLogService,
      );
    });

    it('rejects new export request if an active job is already PENDING or PROCESSING (409 Conflict)', async () => {
      mockExportRepo.findOne.mockImplementation(({ where }: any) => {
        if (Array.isArray(where)) {
          return Promise.resolve({
            id: 'active-job',
            userId: 'user-101',
            status: 'PROCESSING',
          });
        }
        return Promise.resolve(null);
      });

      await expect(service.requestExport('user-101')).rejects.toThrow(ConflictException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('rejects new export request if previous request was created within 7-day cooldown (400 Bad Request)', async () => {
      mockExportRepo.findOne.mockImplementation(({ where }: any) => {
        // Active job check (array of where conditions) returns null (no active job)
        if (Array.isArray(where)) {
          return Promise.resolve(null);
        }
        // Cooldown check (where.createdAt) returns a recent request
        return Promise.resolve({
          id: 'recent-job',
          userId: 'user-101',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        });
      });

      await expect(service.requestExport('user-101')).rejects.toThrow(BadRequestException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('creates PENDING export and stamps queuedAt when no active job and cooldown satisfied', async () => {
      mockExportRepo.findOne.mockResolvedValue(null);

      const result = await service.requestExport('user-101');

      expect(result.status).toBe('PENDING');
      expect(result.queuedAt).toBeInstanceOf(Date);
      expect(mockQueue.add).toHaveBeenCalledWith('process-export', {
        userId: 'user-101',
        requestId: result.requestId,
      });
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'request_created',
          actorId: 'user-101',
        }),
      );
    });

    it('markExportFailed increments retryCount and records lastFailureReason', async () => {
      mockExportRepo.findOne.mockResolvedValueOnce({
        id: 'exp-uuid-1',
        retryCount: 1,
      });

      await service.markExportFailed('exp-uuid-1', 'DB connection timeout during archive compilation');

      expect(mockExportRepo.update).toHaveBeenCalledWith('exp-uuid-1', {
        status: 'FAILED',
        failedAt: expect.any(Date),
        retryCount: 2,
        lastFailureReason: 'DB connection timeout during archive compilation',
      });
    });
  });

  describe('One-Time Token Consumption & Expiry Invariants', () => {
    let service: DataExportService;
    let mockExportRepo: any;
    let mockChunkRepo: any;
    let mockAuditLogService: any;

    beforeEach(() => {
      mockExportRepo = {
        findOne: jest.fn(),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockChunkRepo = {};
      mockAuditLogService = {
        logExportLifecycleEvent: jest.fn().mockResolvedValue(undefined),
      };

      service = new DataExportService(
        mockExportRepo,
        mockChunkRepo as any,
        {} as any,
        mockConfigService as any,
        mockAuditLogService,
      );
    });

    it('consumes one-time token on first download and marks downloadedAt', async () => {
      const token = 'one-time-download-token-nonce-12345';
      const tokenHash = crypto.createHmac('sha256', secret).update(token).digest('hex');

      mockExportRepo.findOne.mockResolvedValueOnce({
        id: 'exp-1',
        userId: 'user-1',
        status: 'READY',
        createdAt: new Date(),
        downloadTokenHash: tokenHash,
        downloadedAt: null,
      });

      const valid = await service.validateAndConsumeToken('exp-1', 'user-1', token);
      expect(valid).toBe(true);

      expect(mockExportRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'exp-1',
          userId: 'user-1',
          downloadTokenHash: tokenHash,
        }),
        expect.objectContaining({
          downloadTokenHash: null,
          downloadedAt: expect.any(Date),
        }),
      );
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'downloaded',
          requestId: 'exp-1',
        }),
      );
    });

    it('rejects token consumption replay when downloadedAt is already set or hash is null', async () => {
      const token = 'already-consumed-token';

      // Record already downloaded
      mockExportRepo.findOne.mockResolvedValueOnce({
        id: 'exp-1',
        userId: 'user-1',
        status: 'READY',
        createdAt: new Date(),
        downloadTokenHash: null,
        downloadedAt: new Date(Date.now() - 60000),
      });

      const valid = await service.validateAndConsumeToken('exp-1', 'user-1', token);
      expect(valid).toBe(false);
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'download_failed',
          metadata: { reason: 'invalid_or_used' },
        }),
      );
    });

    it('rejects token consumption when 24h retention window has elapsed and marks token expired', async () => {
      const token = 'expired-token';
      const tokenHash = crypto.createHmac('sha256', secret).update(token).digest('hex');

      // Export created 25 hours ago (> 24h TTL)
      mockExportRepo.findOne.mockResolvedValueOnce({
        id: 'exp-1',
        userId: 'user-1',
        status: 'READY',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        downloadTokenHash: tokenHash,
        downloadedAt: null,
      });

      const valid = await service.validateAndConsumeToken('exp-1', 'user-1', token);
      expect(valid).toBe(false);

      expect(mockExportRepo.update).toHaveBeenCalledWith('exp-1', {
        downloadTokenHash: null,
        expiredAt: expect.any(Date),
      });
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'token_expired',
          metadata: expect.objectContaining({ reason: 'retention_window_elapsed' }),
        }),
      );
    });

    it('getRedownloadLink generates fresh URL within 24h but rejects after 24h', async () => {
      // Export created 5 hours ago (within 24h window)
      mockExportRepo.findOne.mockResolvedValueOnce({
        id: 'exp-1',
        userId: 'user-1',
        status: 'READY',
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      });

      const freshLink = await service.getRedownloadLink('exp-1', 'user-1');
      expect(freshLink.downloadUrl).toContain('/api/data-export/download/exp-1');
      expect(freshLink.downloadUrl).toContain('token=');

      // Export created 26 hours ago (past 24h window)
      mockExportRepo.findOne.mockResolvedValueOnce({
        id: 'exp-1',
        userId: 'user-1',
        status: 'READY',
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      });

      await expect(service.getRedownloadLink('exp-1', 'user-1')).rejects.toThrow(BadRequestException);
      await expect(service.getRedownloadLink('exp-1', 'user-1')).rejects.toThrow(
        /Secure download link is no longer available/,
      );
    });
  });

  describe('Controller Download Validation & Error Shapes', () => {
    let controller: DataExportController;
    let mockService: any;

    beforeEach(() => {
      mockService = {
        validateAndConsumeToken: jest.fn(),
        getExportFile: jest.fn(),
        getExportChunk: jest.fn(),
        recordFailedDownloadAttempt: jest.fn(),
      };
      controller = new DataExportController(mockService, mockConfigService as any);
    });

    it('throws 410 Gone with EXPORT_LINK_EXPIRED when URL expires timestamp is in the past', async () => {
      const pastExpires = (Date.now() - 10000).toString();
      const mockRes = { set: jest.fn(), send: jest.fn() } as any;

      await expect(
        controller.download(
          'exp-1',
          'user-1',
          pastExpires,
          'any-signature',
          undefined,
          'token-1',
          mockRes,
        ),
      ).rejects.toThrow(GoneException);

      try {
        await controller.download(
          'exp-1',
          'user-1',
          pastExpires,
          'any-signature',
          undefined,
          'token-1',
          mockRes,
        );
      } catch (err: any) {
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            statusCode: 410,
            code: 'EXPORT_LINK_EXPIRED',
            message: 'Download link has expired.',
          }),
        );
      }
    });

    it('throws 410 Gone with EXPORT_TOKEN_EXPIRED when one-time token was already consumed', async () => {
      const futureExpires = (Date.now() + 3600000).toString();
      const token = 'already-used-token';
      const dataToSign = `exp-1:user-1:${futureExpires}:${token}`;
      const validSignature = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');

      mockService.validateAndConsumeToken.mockResolvedValueOnce(false);
      const mockRes = { set: jest.fn(), send: jest.fn() } as any;

      try {
        await controller.download(
          'exp-1',
          'user-1',
          futureExpires,
          validSignature,
          undefined,
          token,
          mockRes,
        );
      } catch (err: any) {
        expect(err).toBeInstanceOf(GoneException);
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            statusCode: 410,
            code: 'EXPORT_TOKEN_EXPIRED',
            message: 'Download link has already been used or has expired. Request a new link.',
          }),
        );
      }
    });
  });
});
