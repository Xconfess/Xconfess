import { Test, TestingModule } from '@nestjs/testing';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';

describe('DataExportController', () => {
  let controller: DataExportController;
  let mockExportService: jest.Mocked<DataExportService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockExportService = {
      requestExport: jest.fn(),
      getLatestExport: jest.fn(),
      getExportHistory: jest.fn(),
      getJobStatus: jest.fn(),
      getRedownloadLink: jest.fn(),
      getExportFile: jest.fn(),
      getExportChunk: jest.fn(),
      generateSignedDownloadUrl: jest.fn(),
      validateAndConsumeToken: jest.fn().mockResolvedValue(true),
      invalidateDownloadToken: jest.fn(),
      recordFailedDownloadAttempt: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockConfigService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'app.appSecret') return 'test-secret';
        if (key === 'app.backendUrl') return 'https://backend.example.com';
        return fallback;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataExportController],
      providers: [
        {
          provide: DataExportService,
          useValue: mockExportService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<DataExportController>(DataExportController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── Download Endpoint Security Tests ────────────────────────────────────────

  // Helper: build a valid signed token + signature for single-file downloads.
  function buildSingleFileParams(
    requestId: string,
    userId: string,
    expiresMs: number,
    token: string,
    secret = 'test-secret',
  ) {
    const dataToSign = `${requestId}:${userId}:${expiresMs}:${token}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(dataToSign)
      .digest('hex');
    return { signature, token };
  }

  // Helper: build a valid signed signature for chunked downloads.
  function buildChunkParams(
    requestId: string,
    userId: string,
    chunkIndex: number,
    expiresMs: number,
    secret = 'test-secret',
  ) {
    const dataToSign = `${requestId}:${userId}:${chunkIndex}:${expiresMs}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(dataToSign)
      .digest('hex');
    return { signature };
  }

  describe('Download Endpoint Security', () => {
    it('should reject download requests with expired timestamps', async () => {
      const expiredTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const requestId = 'req-1';
      const userId = 'user-1';
      const token = 'sometoken';
      const { signature } = buildSingleFileParams(
        requestId,
        userId,
        expiredTime,
        token,
      );

      await expect(
        controller.download(
          requestId,
          userId,
          expiredTime.toString(),
          signature,
          undefined,
          token,
          {} as any,
        ),
      ).rejects.toThrow(GoneException);
    });

    it('should reject download requests with invalid signatures without revealing ownership', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const invalidSignature = 'invalid-signature';

      await expect(
        controller.download(
          requestId,
          userId,
          futureTime.toString(),
          invalidSignature,
          undefined,
          'any-token',
          {} as any,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockExportService.recordFailedDownloadAttempt).toHaveBeenCalledWith(
        requestId,
        'invalid_signature',
      );
      await expect(
        controller.download(
          requestId,
          userId,
          futureTime.toString(),
          invalidSignature,
          undefined,
          'any-token',
          {} as any,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: 'Invalid download link.',
        }),
      });
    });

    it('should reject download requests with malformed timestamps', async () => {
      const requestId = 'req-1';
      const userId = 'user-1';

      await expect(
        controller.download(
          requestId,
          userId,
          'not-a-number',
          'any-signature',
          undefined,
          'any-token',
          {} as any,
        ),
      ).rejects.toThrow(GoneException);
    });

    it('should reject single-file download when token is missing', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const token = 'valid-token';
      const { signature } = buildSingleFileParams(
        requestId,
        userId,
        futureTime,
        token,
      );

      // Pass undefined token — should reject even with a valid signature.
      await expect(
        controller.download(
          requestId,
          userId,
          futureTime.toString(),
          signature,
          undefined,
          undefined,
          {} as any,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockExportService.recordFailedDownloadAttempt).toHaveBeenCalledWith(
        requestId,
        'missing_token',
      );
    });

    it('should reject replayed single-file download after token consumed', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const token = 'used-token';
      const { signature } = buildSingleFileParams(
        requestId,
        userId,
        futureTime,
        token,
      );

      // Simulate token already consumed.
      mockExportService.validateAndConsumeToken.mockResolvedValue(false);

      await expect(
        controller.download(
          requestId,
          userId,
          futureTime.toString(),
          signature,
          undefined,
          token,
          {} as any,
        ),
      ).rejects.toThrow(GoneException);
    });

    it('should consume the token on first successful single-file download', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const token = 'fresh-token';
      const { signature } = buildSingleFileParams(
        requestId,
        userId,
        futureTime,
        token,
      );

      mockExportService.validateAndConsumeToken.mockResolvedValue(true);
      mockExportService.getExportFile.mockResolvedValue({
        fileData: Buffer.from('zip content'),
        isChunked: false,
      } as any);

      const mockRes = { set: jest.fn(), send: jest.fn() } as any;

      await controller.download(
        requestId,
        userId,
        futureTime.toString(),
        signature,
        undefined,
        token,
        mockRes,
      );

      expect(mockExportService.validateAndConsumeToken).toHaveBeenCalledWith(
        requestId,
        userId,
        token,
      );
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should handle chunked download signature validation', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const chunkIndex = '2';
      const { signature } = buildChunkParams(requestId, userId, 2, futureTime);

      const mockChunk = {
        fileData: Buffer.from('chunk data'),
        chunkSize: 10,
        checksum: 'abc123',
      };

      mockExportService.getExportChunk.mockResolvedValue(mockChunk as any);

      const mockRes = { set: jest.fn(), send: jest.fn() } as any;

      await controller.download(
        requestId,
        userId,
        futureTime.toString(),
        signature,
        chunkIndex,
        undefined,
        mockRes,
      );

      expect(mockExportService.getExportChunk).toHaveBeenCalledWith(
        requestId,
        userId,
        2,
      );
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="xconfess-data-${userId}-part3.zip"`,
        'Content-Length': 10,
        'X-Chunk-Checksum': 'abc123',
      });
    });

    it('should reject chunked download with invalid chunk signature', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const chunkIndex = '2';

      // Signature built without chunk index — invalid for a chunked request.
      const badSig = crypto
        .createHmac('sha256', 'test-secret')
        .update(`${requestId}:${userId}:${futureTime}`)
        .digest('hex');

      await expect(
        controller.download(
          requestId,
          userId,
          futureTime.toString(),
          badSig,
          chunkIndex,
          undefined,
          {} as any,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return metadata for chunked exports', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const token = 'tok';
      const { signature } = buildSingleFileParams(
        requestId,
        userId,
        futureTime,
        token,
      );

      const mockChunkedExport = {
        fileData: null,
        isChunked: true,
        chunkCount: 3,
        totalSize: '3000',
        combinedChecksum: 'def456',
      };

      mockExportService.getExportFile.mockResolvedValue(
        mockChunkedExport as any,
      );
      mockExportService.generateSignedDownloadUrl
        .mockResolvedValueOnce(
          'https://backend.example.com/api/data-export/download/req-1?userId=user-1&expires=123&signature=abc&chunk=0',
        )
        .mockResolvedValueOnce(
          'https://backend.example.com/api/data-export/download/req-1?userId=user-1&expires=123&signature=def&chunk=1',
        )
        .mockResolvedValueOnce(
          'https://backend.example.com/api/data-export/download/req-1?userId=user-1&expires=123&signature=ghi&chunk=2',
        );

      const mockRes = { json: jest.fn() } as any;

      await controller.download(
        requestId,
        userId,
        futureTime.toString(),
        signature,
        undefined,
        token,
        mockRes,
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'This export is multi-part.',
        chunkCount: 3,
        totalSize: '3000',
        checksum: 'def456',
        downloadUrls: [
          expect.stringContaining('chunk=0'),
          expect.stringContaining('chunk=1'),
          expect.stringContaining('chunk=2'),
        ],
      });
    });

    it('should handle missing export files gracefully', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const token = 'tok';
      const { signature } = buildSingleFileParams(
        requestId,
        userId,
        futureTime,
        token,
      );

      mockExportService.getExportFile.mockResolvedValue(null);

      await expect(
        controller.download(
          requestId,
          userId,
          futureTime.toString(),
          signature,
          undefined,
          token,
          {} as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Redownload Link Tests ───────────────────────────────────────────────────

  describe('Redownload Link Generation', () => {
    it('should generate new download links for valid exports', async () => {
      const requestId = 'req-1';
      const userId = 'user-1';
      const mockUser = { id: userId };

      mockExportService.getRedownloadLink.mockResolvedValue({
        downloadUrl:
          'https://backend.example.com/api/data-export/download/req-1?userId=user-1&expires=123&signature=abc',
      });

      const result = await controller.redownload(requestId, {
        user: mockUser,
      } as any);

      expect(mockExportService.getRedownloadLink).toHaveBeenCalledWith(
        requestId,
        userId,
      );
      expect(result.downloadUrl).toContain('signature=');
    });
  });

  // ── Status Endpoint Tests ────────────────────────────────────────────────────

  describe('Job Status Endpoint', () => {
    it('should return detailed job status', async () => {
      const requestId = 'req-1';
      const userId = 'user-1';
      const mockUser = { id: userId };

      const mockStatus = {
        id: requestId,
        userId,
        status: 'READY',
        progress: {
          queuedAt: new Date(),
          processingAt: new Date(),
          completedAt: new Date(),
          failedAt: null,
          expiredAt: null,
          retryCount: 0,
          lastFailureReason: null,
        },
      };

      mockExportService.getJobStatus.mockResolvedValue(mockStatus as any);

      const result = await controller.getJobStatus(requestId, {
        user: mockUser,
      } as any);

      expect(mockExportService.getJobStatus).toHaveBeenCalledWith(
        requestId,
        userId,
      );
      expect(result.status).toBe('READY');
      expect(result.progress).toBeDefined();
    });
  });

  // ── History Endpoint Tests ───────────────────────────────────────────────────

  describe('History Endpoint', () => {
    it('should return export history with latest and full history', async () => {
      const userId = 'user-1';
      const mockUser = { id: userId };

      const mockLatest = {
        id: 'req-latest',
        status: 'READY',
        createdAt: new Date(),
      };

      const mockHistory = [
        mockLatest,
        {
          id: 'req-older',
          status: 'EXPIRED',
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ];

      mockExportService.getLatestExport.mockResolvedValue(mockLatest as any);
      mockExportService.getExportHistory.mockResolvedValue(mockHistory as any);

      const result = await controller.history({ user: mockUser } as any);

      expect(mockExportService.getLatestExport).toHaveBeenCalledWith(userId);
      expect(mockExportService.getExportHistory).toHaveBeenCalledWith(userId);
      expect(result.latest).toBe(mockLatest);
      expect(result.history).toEqual(mockHistory);
    });
  });

  // ── Request Export Tests ─────────────────────────────────────────────────────

  describe('Request Export Endpoint', () => {
    it('should create a new export job and return 201', async () => {
      const userId = 'user-1';
      const mockUser = { id: userId };
      const mockResult = {
        requestId: 'req-new',
        status: 'PENDING',
        queuedAt: new Date(),
      };

      mockExportService.requestExport.mockResolvedValue(mockResult as any);

      const result = await controller.requestExport({ user: mockUser } as any);

      expect(mockExportService.requestExport).toHaveBeenCalledWith(userId);
      expect(result.requestId).toBe('req-new');
      expect(result.status).toBe('PENDING');
    });

    it('should propagate ConflictException (409) when an active export already exists', async () => {
      const userId = 'user-2';
      const mockUser = { id: userId };

      mockExportService.requestExport.mockRejectedValue(
        new ConflictException(
          'An export is already in progress. Please wait for it to complete.',
        ),
      );

      await expect(
        controller.requestExport({ user: mockUser } as any),
      ).rejects.toThrow(ConflictException);

      expect(mockExportService.requestExport).toHaveBeenCalledWith(userId);
    });

    it('should propagate BadRequestException (400) for the 7-day rate limit', async () => {
      const userId = 'user-3';
      const mockUser = { id: userId };

      mockExportService.requestExport.mockRejectedValue(
        new BadRequestException('Export allowed once every 7 days.'),
      );

      await expect(
        controller.requestExport({ user: mockUser } as any),
      ).rejects.toThrow(BadRequestException);

      expect(mockExportService.requestExport).toHaveBeenCalledWith(userId);
    });

    it('should not create a second job when called twice concurrently for the same user', async () => {
      const userId = 'user-4';
      const mockUser = { id: userId };
      const mockResult = {
        requestId: 'req-first',
        status: 'PENDING',
        queuedAt: new Date(),
      };

      // First call succeeds; second call raises ConflictException as if an active job exists.
      mockExportService.requestExport
        .mockResolvedValueOnce(mockResult as any)
        .mockRejectedValueOnce(
          new ConflictException(
            'An export is already in progress. Please wait for it to complete.',
          ),
        );

      const first = controller.requestExport({ user: mockUser } as any);
      const second = controller.requestExport({ user: mockUser } as any);

      const [firstResult] = await Promise.allSettled([first, second]);

      expect(firstResult.status).toBe('fulfilled');
      expect(mockExportService.requestExport).toHaveBeenCalledTimes(2);
    });
  });
});
