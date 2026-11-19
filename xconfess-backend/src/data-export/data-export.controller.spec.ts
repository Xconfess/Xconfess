// ── Imports ──────────────────────────────────────────────────────────────────
// Nest's testing utilities let us build a lightweight module with only the pieces we need.
import { Test, TestingModule } from '@nestjs/testing';
// The class under test.
import { DataExportController } from './data-export.controller';
// The service the controller depends on (we mock it below).
import { DataExportService } from './data-export.service';
// Used by the controller to read the app secret and backend URL (also mocked).
import { ConfigService } from '@nestjs/config';
// HTTP exceptions the controller is expected to throw/propagate.
import {
  BadRequestException,
  ConflictException,
  GoneException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
// Node's crypto is used to build valid HMAC signatures, mirroring what the controller verifies.
import * as crypto from 'crypto';

describe('DataExportController', () => {
  // Shared variables, re-assigned before every test so tests don't leak state.
  let controller: DataExportController;
  let mockExportService: jest.Mocked<DataExportService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    // Mock every service method the controller may call.
    // jest.fn() lets us control return values and assert on how they were called.
    mockExportService = {
      requestExport: jest.fn(),
      getLatestExport: jest.fn(),
      getExportHistory: jest.fn(),
      getJobStatus: jest.fn(),
      getRedownloadLink: jest.fn(),
      getExportFile: jest.fn(),
      getExportChunk: jest.fn(),
      generateSignedDownloadUrl: jest.fn(),
      // Default: token is valid and gets consumed successfully.
      validateAndConsumeToken: jest.fn().mockResolvedValue(true),
      invalidateDownloadToken: jest.fn(),
      // Default: logging a failed attempt succeeds silently.
      recordFailedDownloadAttempt: jest.fn().mockResolvedValue(undefined),
    } as any; // `as any` skips having to implement the whole service type.

    // Fake config: returns fixed values for the keys the controller reads,
    // and falls back to the provided default for anything else.
    mockConfigService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'app.appSecret') return 'test-secret'; // HMAC secret used for signing
        if (key === 'app.backendUrl') return 'https://backend.example.com';
        return fallback;
      }),
    } as any;

    // Build an isolated Nest module with the real controller and the mocked providers.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataExportController],
      providers: [
        {
          provide: DataExportService,
          useValue: mockExportService, // inject the mock instead of the real service
        },
        {
          provide: ConfigService,
          useValue: mockConfigService, // inject the mock config
        },
      ],
    }).compile();

    // Grab the controller instance from the module for use in tests.
    controller = module.get<DataExportController>(DataExportController);
  });

  // Sanity check: the module wired up and the controller was created.
  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── Download Endpoint Security Tests ────────────────────────────────────────

  // Helper: build a valid signed token + signature for single-file downloads.
  // The signed payload format must match what the controller verifies:
  // requestId:userId:expires:token
  function buildSingleFileParams(
    requestId: string,
    userId: string,
    expiresMs: number,
    token: string,
    secret = 'test-secret', // must match the mocked app.appSecret
  ) {
    const dataToSign = `${requestId}:${userId}:${expiresMs}:${token}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(dataToSign)
      .digest('hex');
    return { signature, token };
  }

  // Helper: build a valid signed signature for chunked downloads.
  // Payload format differs: requestId:userId:chunkIndex:expires (no token).
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
    // A link older than its expiry must be rejected with 410 Gone.
    it('should reject download requests with expired timestamps', async () => {
      const expiredTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const requestId = 'req-1';
      const userId = 'user-1';
      const token = 'sometoken';
      // Signature is valid, so the only reason to fail is the expiry.
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
          undefined, // no chunk index -> single-file download
          token,
          {} as any, // response object isn't reached, so an empty stub is fine
        ),
      ).rejects.toThrow(GoneException);
    });

    // A tampered/invalid signature must give a generic error that leaks nothing
    // about whether the request or user exists.
    it('should reject download requests with invalid signatures without revealing ownership', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000; // 1 hour from now (not expired)
      const requestId = 'req-1';
      const userId = 'user-1';
      const invalidSignature = 'invalid-signature';

      // 1) Throws 401 Unauthorized.
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

      // 2) The failed attempt is logged with a specific reason (for auditing/rate limiting).
      expect(mockExportService.recordFailedDownloadAttempt).toHaveBeenCalledWith(
        requestId,
        'invalid_signature',
      );

      // 3) The error message is generic ("Invalid download link.") so attackers learn nothing.
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

    // A non-numeric `expires` value can't be validated, so treat the link as expired.
    it('should reject download requests with malformed timestamps', async () => {
      const requestId = 'req-1';
      const userId = 'user-1';

      await expect(
        controller.download(
          requestId,
          userId,
          'not-a-number', // malformed expiry
          'any-signature',
          undefined,
          'any-token',
          {} as any,
        ),
      ).rejects.toThrow(GoneException);
    });

    // Single-file downloads require a one-time token, even if the signature is valid.
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
          undefined, // token intentionally omitted
          {} as any,
        ),
      ).rejects.toThrow(UnauthorizedException);
      // The failure reason is recorded for monitoring.
      expect(mockExportService.recordFailedDownloadAttempt).toHaveBeenCalledWith(
        requestId,
        'missing_token',
      );
    });

    // Replay protection: a token that was already used must not work a second time.
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

    // Happy path: valid signature + fresh token -> token is consumed and the file is sent.
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

      // Token is valid on first use.
      mockExportService.validateAndConsumeToken.mockResolvedValue(true);
      // Service returns a normal (non-chunked) file.
      mockExportService.getExportFile.mockResolvedValue({
        fileData: Buffer.from('zip content'),
        isChunked: false,
      } as any);

      // Fake Express response with the methods the controller calls.
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

      // The token must have been validated/consumed with the right arguments...
      expect(mockExportService.validateAndConsumeToken).toHaveBeenCalledWith(
        requestId,
        userId,
        token,
      );
      // ...and the file must have been sent back to the client.
      expect(mockRes.send).toHaveBeenCalled();
    });

    // Chunked downloads use a different signature (includes chunk index, no token).
    it('should handle chunked download signature validation', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-1';
      const userId = 'user-1';
      const chunkIndex = '2'; // query params arrive as strings
      const { signature } = buildChunkParams(requestId, userId, 2, futureTime);

      // Fake chunk returned by the service.
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
        undefined, // no token needed for chunks
        mockRes,
      );

      // The controller should convert "2" to the number 2 when calling the service.
      expect(mockExportService.getExportChunk).toHaveBeenCalledWith(
        requestId,
        userId,
        2,
      );
      // Response headers: zip type, filename uses 1-based part number (index 2 -> part3),
      // length, and the chunk checksum so clients can verify integrity.
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="xconfess-data-${userId}-part3.zip"`,
        'Content-Length': 10,
        'X-Chunk-Checksum': 'abc123',
      });
    });

    // A chunk request signed with the single-file format must be rejected.
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

    // When an export is split into parts, the endpoint returns JSON metadata
    // with signed URLs for each chunk instead of the file itself.
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

      // Service reports a chunked export with 3 parts.
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
      // One signed URL is generated per chunk (called 3 times, in order).
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

      // This path responds with res.json(), not res.send().
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

      // Verify the JSON payload: message, counts, checksum, and one URL per chunk.
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

    // If the service can't find the file, the controller should fail cleanly with
    // the same 404 used for other users' exports and expired artifacts.
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

      // Service returns nothing -> file is missing.
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
      ).rejects.toThrow(NotFoundException);
    });

    // Expired artifacts are indistinguishable from unknown/foreign exports.
    it('should return the same 404 when the artifact is not accessible', async () => {
      const futureTime = Date.now() + 60 * 60 * 1000;
      const requestId = 'req-other-user';
      const userId = 'user-1';
      const token = 'tok';
      const { signature } = buildSingleFileParams(
        requestId,
        userId,
        futureTime,
        token,
      );

      mockExportService.getExportFile.mockResolvedValue({
        fileData: null,
        isChunked: false,
      } as any);

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
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Redownload Link Tests ───────────────────────────────────────────────────

  describe('Redownload Link Generation', () => {
    // An authenticated user can request a fresh signed link for an existing export.
    it('should generate new download links for valid exports', async () => {
      const requestId = 'req-1';
      const userId = 'user-1';
      const mockUser = { id: userId }; // stands in for req.user set by the auth guard

      mockExportService.getRedownloadLink.mockResolvedValue({
        downloadUrl:
          'https://backend.example.com/api/data-export/download/req-1?userId=user-1&expires=123&signature=abc',
      });

      const result = await controller.redownload(requestId, {
        user: mockUser,
      } as any);

      // The service is called with the request id and the *authenticated* user's id.
      expect(mockExportService.getRedownloadLink).toHaveBeenCalledWith(
        requestId,
        userId,
      );
      // The returned URL must be signed.
      expect(result.downloadUrl).toContain('signature=');
    });
  });

  // ── Status Endpoint Tests ────────────────────────────────────────────────────

  describe('Job Status Endpoint', () => {
    // The status endpoint returns the job state plus a timeline of its progress.
    it('should return detailed job status', async () => {
      const requestId = 'req-1';
      const userId = 'user-1';
      const mockUser = { id: userId };

      // Fake status object covering each lifecycle timestamp.
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

      // Scoped to the current user so people can't read others' jobs.
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
    // The history endpoint returns both the most recent export and the full list.
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

      // Both service methods are called with the current user's id.
      expect(mockExportService.getLatestExport).toHaveBeenCalledWith(userId);
      expect(mockExportService.getExportHistory).toHaveBeenCalledWith(userId);
      // toBe checks same object reference; toEqual checks deep equality.
      expect(result.latest).toBe(mockLatest);
      expect(result.history).toEqual(mockHistory);
    });
  });

  // ── Request Export Tests ─────────────────────────────────────────────────────

  describe('Request Export Endpoint', () => {
    // Happy path: a new export job is created.
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

    // If the user already has an active export, the 409 from the service passes through.
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

    // The 7-day rate limit error (400) from the service also passes through unchanged.
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

    // Two simultaneous requests: the first succeeds, the second is rejected as a conflict.
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

      // Fire both calls without awaiting so they run concurrently.
      const first = controller.requestExport({ user: mockUser } as any);
      const second = controller.requestExport({ user: mockUser } as any);

      // allSettled waits for both without throwing on the rejected one.
      const [firstResult] = await Promise.allSettled([first, second]);

      // The first request went through; both attempts reached the service.
      expect(firstResult.status).toBe('fulfilled');
      expect(mockExportService.requestExport).toHaveBeenCalledTimes(2);
    });
  });
});