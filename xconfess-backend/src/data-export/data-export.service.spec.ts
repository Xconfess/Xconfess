import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { DataExportService } from './data-export.service';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EXPORT_QUEUE_NAME } from './data-export.constants';

describe('DataExportService', () => {
  let service: DataExportService;

  const hashToken = (token: string) =>
    crypto.createHmac('sha256', 'test-secret').update(token).digest('hex');

  const mockQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  const mockExportRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder as any),
  };

  const mockChunkRepository = {
    findOne: jest.fn(),
  };

  const mockExportQueue = {
    add: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'app.appSecret') return 'test-secret';
      if (key === 'app.backendUrl') return 'https://backend.example.com';
      return fallback;
    }),
  };

  const mockAuditLogService = {
    logExportLifecycleEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockExportRepository.findOne.mockReset();
    mockExportRepository.find.mockReset();
    mockExportRepository.create.mockReset();
    mockExportRepository.save.mockReset();
    mockExportRepository.update.mockReset();
    mockExportRepository.createQueryBuilder.mockReset();
    mockQueryBuilder.update.mockClear();
    mockQueryBuilder.set.mockClear();
    mockQueryBuilder.where.mockClear();
    mockQueryBuilder.andWhere.mockClear();
    mockQueryBuilder.execute.mockClear();
    mockChunkRepository.findOne.mockReset();
    mockExportQueue.add.mockReset();
    mockAuditLogService.logExportLifecycleEvent.mockReset();
    mockAuditLogService.logExportLifecycleEvent.mockResolvedValue(undefined);
    mockConfigService.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'ENABLE_BACKGROUND_JOBS') return 'true';
      if (key === 'app.appSecret') return 'test-secret';
      if (key === 'app.backendUrl') return 'https://backend.example.com';
      return fallback;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        {
          provide: getRepositoryToken(ExportRequest),
          useValue: mockExportRepository,
        },
        {
          provide: getRepositoryToken(ExportChunk),
          useValue: mockChunkRepository,
        },
        {
          provide: getQueueToken(EXPORT_QUEUE_NAME),
          useValue: mockExportQueue,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<DataExportService>(DataExportService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  // ── requestExport ──────────────────────────────────────────────────────────

  it('creates export request and emits request-created audit entry', async () => {
    const now = new Date('2026-03-24T22:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      const created = {
        id: 'req-1',
        userId: '42',
        status: 'PENDING',
        queuedAt: now,
      } as ExportRequest;

      mockExportRepository.findOne.mockResolvedValue(null);
      mockExportRepository.create.mockReturnValue(created);
      mockExportRepository.save.mockResolvedValue(created);
      mockExportQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.requestExport('42');

      expect(result).toMatchObject({ requestId: 'req-1', status: 'PENDING' });
      expect(result.queuedAt).toEqual(now);

      // entity should be created with queuedAt set
      expect(mockExportRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '42',
          status: 'PENDING',
          queuedAt: now,
        }),
      );

      expect(mockExportQueue.add).toHaveBeenCalledWith('process-export', {
        userId: '42',
        requestId: 'req-1',
      });
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'request_created',
          actorType: 'user',
          actorId: '42',
          requestId: 'req-1',
          exportId: 'req-1',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects duplicate request within seven days', async () => {
    mockExportRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'existing-1',
        userId: '42',
        createdAt: new Date(),
      });

    await expect(service.requestExport('42')).rejects.toThrow(
      'Export allowed once every 7 days.',
    );
    expect(mockExportRepository.save).not.toHaveBeenCalled();
    expect(mockExportQueue.add).not.toHaveBeenCalled();
    expect(mockAuditLogService.logExportLifecycleEvent).not.toHaveBeenCalled();
  });

  // ── markExportProcessing ───────────────────────────────────────────────────

  it('stamps processingAt and sets status to PROCESSING', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T22:05:00.000Z'));

    try {
      mockExportRepository.update.mockResolvedValue({ affected: 1 });

      await service.markExportProcessing('req-proc-1');

      expect(mockExportRepository.update).toHaveBeenCalledWith('req-proc-1', {
        status: 'PROCESSING',
        processingAt: new Date('2026-03-24T22:05:00.000Z'),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  // ── markExportFailed ───────────────────────────────────────────────────────

  it('increments retryCount and stores lastFailureReason on failure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T22:10:00.000Z'));

    try {
      // First failure: retryCount is currently 0
      mockExportRepository.findOne.mockResolvedValue({
        retryCount: 0,
      } as ExportRequest);
      mockExportRepository.update.mockResolvedValue({ affected: 1 });

      await service.markExportFailed('req-fail-1', 'out of memory');

      expect(mockExportRepository.update).toHaveBeenCalledWith('req-fail-1', {
        status: 'FAILED',
        failedAt: new Date('2026-03-24T22:10:00.000Z'),
        retryCount: 1,
        lastFailureReason: 'out of memory',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('accumulates retryCount across multiple failures', async () => {
    // Simulate a second failure (retryCount is already 1)
    mockExportRepository.findOne.mockResolvedValue({
      retryCount: 1,
    } as ExportRequest);
    mockExportRepository.update.mockResolvedValue({ affected: 1 });

    await service.markExportFailed('req-fail-2', 'disk full');

    expect(mockExportRepository.update).toHaveBeenCalledWith(
      'req-fail-2',
      expect.objectContaining({
        retryCount: 2,
        lastFailureReason: 'disk full',
      }),
    );
  });

  it('handles missing export record gracefully (retryCount defaults to 0)', async () => {
    mockExportRepository.findOne.mockResolvedValue(null);
    mockExportRepository.update.mockResolvedValue({ affected: 0 });

    await service.markExportFailed('req-missing', 'error');

    expect(mockExportRepository.update).toHaveBeenCalledWith(
      'req-missing',
      expect.objectContaining({ retryCount: 1 }),
    );
  });

  // ── markExportGenerated ────────────────────────────────────────────────────

  it('stamps completedAt and emits generation_completed audit entry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T22:15:00.000Z'));

    try {
      mockExportRepository.update.mockResolvedValue({ affected: 1 });

      await service.markExportGenerated('req-5', '12', Buffer.from('payload'), {
        jobId: 'job-22',
      });

      expect(mockExportRepository.update).toHaveBeenCalledWith('req-5', {
        fileData: Buffer.from('payload'),
        status: 'READY',
        completedAt: new Date('2026-03-24T22:15:00.000Z'),
      });
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'generation_completed',
          actorType: 'system',
          actorId: EXPORT_QUEUE_NAME,
          requestId: 'req-5',
          exportId: 'req-5',
          metadata: expect.objectContaining({
            userId: '12',
            status: 'READY',
            jobId: 'job-22',
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  // ── getJobStatus ───────────────────────────────────────────────────────────

  it('returns full lifecycle timeline from getJobStatus', async () => {
    const queuedAt = new Date('2026-03-24T22:00:00.000Z');
    const processingAt = new Date('2026-03-24T22:01:00.000Z');
    const completedAt = new Date('2026-03-24T22:03:00.000Z');

    mockExportRepository.findOne.mockResolvedValue({
      id: 'req-status-1',
      userId: 'u-99',
      status: 'READY',
      createdAt: queuedAt,
      queuedAt,
      processingAt,
      completedAt,
      failedAt: null,
      expiredAt: null,
      retryCount: 0,
      lastFailureReason: null,
    } as ExportRequest);

    // Make the expiry in the future so status stays READY
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T22:30:00.000Z'));

    try {
      const status = await service.getJobStatus('req-status-1', 'u-99');

      expect(status.id).toBe('req-status-1');
      expect(status.status).toBe('READY');
      expect(status.progress.queuedAt).toEqual(queuedAt);
      expect(status.progress.processingAt).toEqual(processingAt);
      expect(status.progress.completedAt).toEqual(completedAt);
      expect(status.progress.failedAt).toBeNull();
      expect(status.progress.retryCount).toBe(0);
      expect(status.progress.lastFailureReason).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('throws NotFoundException from getJobStatus when record not found', async () => {
    mockExportRepository.findOne.mockResolvedValue(null);

    await expect(service.getJobStatus('req-missing', 'u-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns EXPIRED status when READY but download window has elapsed', async () => {
    const oldDate = new Date('2026-03-22T00:00:00.000Z'); // 2 days ago
    mockExportRepository.findOne.mockResolvedValue({
      id: 'req-old',
      userId: 'u-1',
      status: 'READY',
      createdAt: oldDate,
      queuedAt: oldDate,
      processingAt: null,
      completedAt: null,
      failedAt: null,
      expiredAt: null,
      retryCount: 0,
      lastFailureReason: null,
    } as ExportRequest);

    const status = await service.getJobStatus('req-old', 'u-1');
    expect(status.status).toBe('EXPIRED');
  });

  // ── getExportHistory includes progress ────────────────────────────────────

  it('includes progress field in getExportHistory items', async () => {
    const queuedAt = new Date('2026-03-24T20:00:00.000Z');
    mockExportRepository.find.mockResolvedValue([
      {
        id: 'req-h-1',
        userId: 'u-5',
        status: 'PROCESSING',
        createdAt: queuedAt,
        queuedAt,
        processingAt: new Date('2026-03-24T20:01:00.000Z'),
        completedAt: null,
        failedAt: null,
        expiredAt: null,
        retryCount: 0,
        lastFailureReason: null,
      },
    ]);

    const history = await service.getExportHistory('u-5');

    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('PROCESSING');
    expect(history[0].progress).toBeDefined();
    expect(history[0].progress.queuedAt).toEqual(queuedAt);
    expect(history[0].progress.processingAt).toEqual(
      new Date('2026-03-24T20:01:00.000Z'),
    );
  });

  // ── legacy tests (unchanged behaviour) ───────────────────────────────────

  it('emits link-refreshed audit record when signed URL is generated', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T10:00:00.000Z'));

    try {
      const url = await service.generateSignedDownloadUrl('req-2', '77');

      const parsed = new URL(url);
      const expires = parsed.searchParams.get('expires');
      const signature = parsed.searchParams.get('signature');
      const token = parsed.searchParams.get('token');
      const expectedSignature = crypto
        .createHmac('sha256', 'test-secret')
        .update(`req-2:77:${expires}:${token}`)
        .digest('hex');

      expect(parsed.origin).toBe('https://backend.example.com');
      expect(parsed.pathname).toBe('/api/data-export/download/req-2');
      expect(parsed.searchParams.get('userId')).toBe('77');
      expect(signature).toBe(expectedSignature);
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'link_refreshed',
          actorType: 'user',
          actorId: '77',
          requestId: 'req-2',
          exportId: 'req-2',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('logs download access when export file is retrieved', async () => {
    const exportFile = { fileData: Buffer.from('zip'), status: 'READY' };
    mockExportRepository.findOne.mockResolvedValue(exportFile);

    const result = await service.getExportFile('req-3', '11');

    expect(result).toEqual(exportFile);
    expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'downloaded',
        actorType: 'user',
        actorId: '11',
        requestId: 'req-3',
        exportId: 'req-3',
      }),
    );
  });

  it('does not emit download audit log when file is missing', async () => {
    mockExportRepository.findOne.mockResolvedValue({
      fileData: null,
      status: 'EXPIRED',
    });

    await service.getExportFile('req-4', '11');

    expect(mockAuditLogService.logExportLifecycleEvent).not.toHaveBeenCalled();
  });

  // --- Chunked export tests ---
  describe('generateSignedDownloadUrl', () => {
    it('should generate a valid URL for non-chunked export', async () => {
      const url = await service.generateSignedDownloadUrl('req-123', 'user-456');
      expect(url).toContain('/api/data-export/download/req-123');
      expect(url).toContain('userId=user-456');
      expect(url).toContain('signature=');
      expect(url).not.toContain('chunk=');
    });

    it('stores only a hash of the one-time token for non-chunked exports', async () => {
      const url = await service.generateSignedDownloadUrl('req-123', 'user-456');
      const token = new URL(url).searchParams.get('token');

      expect(token).toEqual(expect.any(String));
      expect(mockExportRepository.update).toHaveBeenCalledWith(
        'req-123',
        expect.objectContaining({
          downloadTokenHash: hashToken(token as string),
          downloadedAt: null,
        }),
      );
      expect(mockExportRepository.update).not.toHaveBeenCalledWith(
        'req-123',
        expect.objectContaining({ downloadToken: token }),
      );
    });

    it('should generate a valid URL for a specific chunk', async () => {
      const url = await service.generateSignedDownloadUrl('req-123', 'user-456', 5);
      expect(url).toContain('/api/data-export/download/req-123');
      expect(url).toContain('userId=user-456');
      expect(url).toContain('chunk=5');
      expect(url).toContain('signature=');
    });
  });

  describe('getExportChunk', () => {
    it('should throw NotFoundException if request does not exist', async () => {
      mockExportRepository.findOne.mockResolvedValue(null);
      await expect(
        service.getExportChunk('req-1', 'user-1', 0),
      ).rejects.toThrow('Export request not found or unauthorized');
    });

    it('should return the chunk if it exists and user owns the request', async () => {
      mockExportRepository.findOne.mockResolvedValue({
        id: 'req-1',
        userId: 'user-1',
      });
      const mockChunk = { id: 'chunk-1', chunkIndex: 0 };
      mockChunkRepository.findOne.mockResolvedValue(mockChunk);

      const result = await service.getExportChunk('req-1', 'user-1', 0);
      expect(result).toEqual(mockChunk);
      expect(mockExportRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'req-1', userId: 'user-1' },
      });
      expect(mockChunkRepository.findOne).toHaveBeenCalledWith({
        where: { exportRequestId: 'req-1', chunkIndex: 0 },
      });
    });
  });

  // ── Export Retention and Expiry Tests ────────────────────────────────────────

  describe('Export Retention and Expiry Behavior', () => {
    it('should correctly identify expired exports based on 24-hour window', () => {
      const createdAt = new Date('2026-03-23T10:00:00.000Z'); // 2 days ago
      const request = { status: 'READY', createdAt };

      // Mock current time to be after expiry
      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T11:00:00.000Z'));

      try {
        const isStillValid = (service as any).isFileAvailable(request);
        expect(isStillValid).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should correctly identify valid exports within 24-hour window', () => {
      const createdAt = new Date('2026-03-25T09:00:00.000Z'); // 2 hours ago
      const request = { status: 'READY', createdAt };

      // Mock current time to be within expiry window
      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T11:00:00.000Z'));

      try {
        const isStillValid = (service as any).isFileAvailable(request);
        expect(isStillValid).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should reject non-READY status regardless of timestamp', () => {
      const createdAt = new Date(); // recent
      const nonReadyStatuses = ['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED'];

      nonReadyStatuses.forEach((status) => {
        const request = { status, createdAt };
        const isStillValid = (service as any).isFileAvailable(request);
        expect(isStillValid).toBe(false);
      });
    });

    it('should normalize READY status to EXPIRED when download window elapsed', async () => {
      const oldCreatedAt = new Date('2026-03-23T10:00:00.000Z');
      mockExportRepository.findOne.mockResolvedValue({
        id: 'req-expired',
        userId: 'user-1',
        status: 'READY',
        createdAt: oldCreatedAt,
        queuedAt: oldCreatedAt,
        processingAt: null,
        completedAt: null,
        failedAt: null,
        expiredAt: null,
        retryCount: 0,
        lastFailureReason: null,
      } as ExportRequest);

      // Mock current time to be after expiry
      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T11:00:00.000Z'));

      try {
        const status = await service.getJobStatus('req-expired', 'user-1');
        expect(status.status).toBe('EXPIRED');
      } finally {
        jest.useRealTimers();
      }
    });

    it('should preserve READY status when within download window', async () => {
      const recentCreatedAt = new Date('2026-03-25T09:00:00.000Z');
      mockExportRepository.findOne.mockResolvedValue({
        id: 'req-valid',
        userId: 'user-1',
        status: 'READY',
        createdAt: recentCreatedAt,
        queuedAt: recentCreatedAt,
        processingAt: null,
        completedAt: null,
        failedAt: null,
        expiredAt: null,
        retryCount: 0,
        lastFailureReason: null,
      } as ExportRequest);

      // Mock current time to be within expiry window
      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T11:00:00.000Z'));

      try {
        const status = await service.getJobStatus('req-valid', 'user-1');
        expect(status.status).toBe('READY');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ── Download Token Invalidation and Regeneration Tests ─────────────────────

  describe('Download Token Security', () => {
    it('should generate unique signatures for different expiry times', async () => {
      jest.useFakeTimers();

      try {
        // First URL
        jest.setSystemTime(new Date('2026-03-25T10:00:00.000Z'));
        const url1 = await service.generateSignedDownloadUrl('req-1', 'user-1');

        // Second URL (different time = different expiry)
        jest.setSystemTime(new Date('2026-03-25T10:01:00.000Z'));
        const url2 = await service.generateSignedDownloadUrl('req-1', 'user-1');

        const signature1 = new URL(url1).searchParams.get('signature');
        const signature2 = new URL(url2).searchParams.get('signature');

        expect(signature1).not.toBe(signature2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should generate unique signatures for different users', async () => {
      const url1 = await service.generateSignedDownloadUrl('req-1', 'user-1');
      const url2 = await service.generateSignedDownloadUrl('req-1', 'user-2');

      const signature1 = new URL(url1).searchParams.get('signature');
      const signature2 = new URL(url2).searchParams.get('signature');

      expect(signature1).not.toBe(signature2);
    });

    it('should generate unique signatures for different request IDs', async () => {
      const url1 = await service.generateSignedDownloadUrl('req-1', 'user-1');
      const url2 = await service.generateSignedDownloadUrl('req-2', 'user-1');

      const signature1 = new URL(url1).searchParams.get('signature');
      const signature2 = new URL(url2).searchParams.get('signature');

      expect(signature1).not.toBe(signature2);
    });

    it('should include chunk index in signature for chunked exports', async () => {
      const url1 = await service.generateSignedDownloadUrl('req-1', 'user-1', 0);
      const url2 = await service.generateSignedDownloadUrl('req-1', 'user-1', 1);

      const signature1 = new URL(url1).searchParams.get('signature');
      const signature2 = new URL(url2).searchParams.get('signature');

      expect(signature1).not.toBe(signature2);
      expect(url1).toContain('chunk=0');
      expect(url2).toContain('chunk=1');
    });

    it('should reject redownload link request for expired exports', async () => {
      const oldCreatedAt = new Date('2026-03-23T10:00:00.000Z');
      mockExportRepository.findOne.mockResolvedValue({
        id: 'req-expired',
        userId: 'user-1',
        status: 'READY',
        createdAt: oldCreatedAt,
      } as ExportRequest);

      // Mock current time to be after expiry
      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T11:00:00.000Z'));

      try {
        await expect(
          service.getRedownloadLink('req-expired', 'user-1'),
        ).rejects.toThrow(
          'Secure download link is no longer available. Request a new export.',
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should allow redownload link request for valid exports', async () => {
      const recentCreatedAt = new Date('2026-03-25T09:00:00.000Z');
      mockExportRepository.findOne.mockResolvedValue({
        id: 'req-valid',
        userId: 'user-1',
        status: 'READY',
        createdAt: recentCreatedAt,
      } as ExportRequest);

      // Mock current time to be within expiry window
      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T11:00:00.000Z'));

      try {
        const result = await service.getRedownloadLink('req-valid', 'user-1');
        expect(result.downloadUrl).toContain(
          '/api/data-export/download/req-valid',
        );
        expect(result.downloadUrl).toContain('signature=');
        expect(result.downloadUrl).toContain('expires=');
      } finally {
        jest.useRealTimers();
      }
    });

    it('should reject redownload link request for non-READY status', async () => {
      const nonReadyStatuses = ['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED'];

      for (const status of nonReadyStatuses) {
        mockExportRepository.findOne.mockResolvedValue({
          id: `req-${status.toLowerCase()}`,
          userId: 'user-1',
          status,
          createdAt: new Date(),
        } as ExportRequest);

        await expect(
          service.getRedownloadLink(`req-${status.toLowerCase()}`, 'user-1'),
        ).rejects.toThrow(
          'Secure download link is no longer available. Request a new export.',
        );
      }
    });
  });

  // ── Export Lifecycle Edge Cases ─────────────────────────────────────────────

  describe('Export Lifecycle Edge Cases', () => {
    it('should handle rapid status transitions correctly', async () => {
      const requestId = 'req-rapid';
      const userId = 'user-rapid';
      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T10:10:00.000Z'));

      try {
        // Start with PENDING
        const pendingRequest = {
          id: requestId,
          userId,
          status: 'PENDING',
          createdAt: new Date('2026-03-25T10:00:00.000Z'),
          queuedAt: new Date('2026-03-25T10:00:01.000Z'),
          processingAt: null,
          completedAt: null,
          failedAt: null,
          expiredAt: null,
          retryCount: 0,
          lastFailureReason: null,
        } as ExportRequest;
        mockExportRepository.findOne.mockResolvedValue(pendingRequest);

        let status = await service.getJobStatus(requestId, userId);
        expect(status.status).toBe('PENDING');

        // Transition to PROCESSING
        mockExportRepository.findOne.mockResolvedValue({
          ...pendingRequest,
          status: 'PROCESSING',
          processingAt: new Date('2026-03-25T10:01:00.000Z'),
        });

        status = await service.getJobStatus(requestId, userId);
        expect(status.status).toBe('PROCESSING');
        expect(status.progress.processingAt).toEqual(
          new Date('2026-03-25T10:01:00.000Z'),
        );

        // Transition to READY
        mockExportRepository.findOne.mockResolvedValue({
          ...pendingRequest,
          status: 'READY',
          processingAt: new Date('2026-03-25T10:01:00.000Z'),
          completedAt: new Date('2026-03-25T10:05:00.000Z'),
        });

        status = await service.getJobStatus(requestId, userId);
        expect(status.status).toBe('READY');
        expect(status.progress.completedAt).toEqual(
          new Date('2026-03-25T10:05:00.000Z'),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should preserve retry history across status transitions', async () => {
      const requestId = 'req-retry';
      const userId = 'user-retry';

      mockExportRepository.findOne.mockResolvedValue({
        id: requestId,
        userId,
        status: 'READY',
        createdAt: new Date('2026-03-25T09:00:00.000Z'),
        queuedAt: new Date('2026-03-25T09:00:01.000Z'),
        processingAt: new Date('2026-03-25T09:01:00.000Z'),
        completedAt: new Date('2026-03-25T09:05:00.000Z'),
        failedAt: new Date('2026-03-25T09:04:00.000Z'),
        expiredAt: null,
        retryCount: 2,
        lastFailureReason: 'timeout',
      } as ExportRequest);

      const status = await service.getJobStatus(requestId, userId);
      expect(status.progress.retryCount).toBe(2);
      expect(status.progress.lastFailureReason).toBe('timeout');
      expect(status.progress.failedAt).toEqual(
        new Date('2026-03-25T09:04:00.000Z'),
      );
    });

    it('should handle exports that never reached READY status', async () => {
      const requestId = 'req-failed';
      const userId = 'user-failed';

      mockExportRepository.findOne.mockResolvedValue({
        id: requestId,
        userId,
        status: 'FAILED',
        createdAt: new Date('2026-03-25T09:00:00.000Z'),
        queuedAt: new Date('2026-03-25T09:00:01.000Z'),
        processingAt: new Date('2026-03-25T09:01:00.000Z'),
        completedAt: null,
        failedAt: new Date('2026-03-25T09:02:00.000Z'),
        expiredAt: null,
        retryCount: 3,
        lastFailureReason: 'memory limit exceeded',
      } as ExportRequest);

      const status = await service.getJobStatus(requestId, userId);
      expect(status.status).toBe('FAILED');
      expect(status.progress.retryCount).toBe(3);
      expect(status.progress.lastFailureReason).toBe('memory limit exceeded');
      expect(status.progress.completedAt).toBeNull();
    });
  });

  // ── Issue #789: download token expiry ────────────────────────────────────

  describe('validateAndConsumeToken — token lifecycle (issue #789)', () => {
    const requestId = 'req-token-test';
    const userId = 'user-token-test';
    const validToken = 'abc123';
    const validTokenHash = hashToken(validToken);

    it('returns true and invalidates a fresh, unconsumed token within TTL', async () => {
      mockExportRepository.findOne.mockResolvedValueOnce({
        downloadTokenHash: validTokenHash,
        downloadedAt: null,
        createdAt: new Date(), // just now — within 24 h TTL
        status: 'READY',
      } as Partial<ExportRequest>);
      mockExportRepository.update.mockResolvedValueOnce({ affected: 1 });

      const result = await service.validateAndConsumeToken(requestId, userId, validToken);

      expect(result).toBe(true);
      expect(mockExportRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: requestId,
          userId,
          downloadTokenHash: validTokenHash,
        }),
        expect.objectContaining({ downloadTokenHash: null }),
      );
    });

    it('returns false and audits when token does not match', async () => {
      mockExportRepository.findOne.mockResolvedValueOnce({
        downloadTokenHash: hashToken('different-token'),
        downloadedAt: null,
        createdAt: new Date(),
        status: 'READY',
      } as Partial<ExportRequest>);

      const result = await service.validateAndConsumeToken(requestId, userId, validToken);

      expect(result).toBe(false);
      expect(mockExportRepository.update).not.toHaveBeenCalled();
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'download_failed',
          actorType: 'system',
          actorId: 'download-token-validator',
          requestId,
          metadata: expect.objectContaining({ reason: 'invalid_or_used' }),
        }),
      );
    });

    it('returns false when token was already consumed (downloadedAt is set)', async () => {
      mockExportRepository.findOne.mockResolvedValueOnce({
        downloadTokenHash: validTokenHash,
        downloadedAt: new Date('2026-01-01T00:00:00Z'), // already used
        createdAt: new Date(),
        status: 'READY',
      } as Partial<ExportRequest>);

      const result = await service.validateAndConsumeToken(requestId, userId, validToken);

      expect(result).toBe(false);
      expect(mockExportRepository.update).not.toHaveBeenCalled();
    });

    it('returns false and marks token expired when retention window has elapsed', async () => {
      const expiredCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 h ago
      mockExportRepository.findOne.mockResolvedValueOnce({
        downloadTokenHash: validTokenHash,
        downloadedAt: null,
        createdAt: expiredCreatedAt,
        status: 'READY',
      } as Partial<ExportRequest>);
      mockExportRepository.update.mockResolvedValueOnce({ affected: 1 });

      const result = await service.validateAndConsumeToken(requestId, userId, validToken);

      expect(result).toBe(false);
      // The token must be cleared and expiredAt stamped so the record reflects terminal state.
      expect(mockExportRepository.update).toHaveBeenCalledWith(
        requestId,
        expect.objectContaining({ downloadTokenHash: null }),
      );
    });

    it('returns false and audits generically when record not found', async () => {
      mockExportRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.validateAndConsumeToken(requestId, userId, 'any-token');

      expect(result).toBe(false);
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'download_failed',
          actorType: 'system',
          actorId: 'download-token-validator',
          requestId,
          metadata: expect.objectContaining({ reason: 'not_found' }),
        }),
      );
      expect(
        mockAuditLogService.logExportLifecycleEvent.mock.calls[0][0],
      ).not.toHaveProperty('actorId', userId);
    });

    it('rejects replay when the conditional consume update loses the race', async () => {
      mockExportRepository.findOne.mockResolvedValueOnce({
        downloadTokenHash: validTokenHash,
        downloadedAt: null,
        createdAt: new Date(),
        status: 'READY',
      } as Partial<ExportRequest>);
      mockExportRepository.update.mockResolvedValueOnce({ affected: 0 });

      const result = await service.validateAndConsumeToken(
        requestId,
        userId,
        validToken,
      );

      expect(result).toBe(false);
      expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'download_failed',
          metadata: expect.objectContaining({ reason: 'replay_race' }),
        }),
      );
    });
  });

  it('expires stale download tokens and logs a cleanup lifecycle event', async () => {
    const now = new Date('2026-03-25T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    mockQueryBuilder.execute.mockResolvedValue({ affected: 3 });
    mockExportRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

    const result = await service.expireStaleDownloadTokens();

    expect(result).toBe(3);
    expect(mockExportRepository.createQueryBuilder).toHaveBeenCalled();
    expect(mockQueryBuilder.update).toHaveBeenCalledWith(ExportRequest);
    expect(mockQueryBuilder.set).toHaveBeenCalledWith({
      downloadTokenHash: null,
      expiredAt: expect.any(Function),
    });
    expect(mockQueryBuilder.where).toHaveBeenCalledWith('downloadTokenHash IS NOT NULL');
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('downloadedAt IS NULL');
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'createdAt < :cutoff',
      expect.objectContaining({ cutoff: expect.any(Date) }),
    );
    expect(mockAuditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'export_expired',
        actorType: 'system',
      }),
    );

    jest.useRealTimers();
  });
});
