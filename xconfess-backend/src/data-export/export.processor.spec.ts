import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExportProcessor } from './export.processor';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { User } from '../user/entities/user.entity';
import { DataExportService } from './data-export.service';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  BadRequestException,
} from '@nestjs/common';

describe('ExportProcessor', () => {
  let processor: ExportProcessor;
  let exportRepo: any;
  let chunkRepo: any;
  let userRepo: any;
  let dataExportService: any;
  let auditLogService: any;

  beforeEach(async () => {
    exportRepo = {
      update: jest.fn(),
    };
    chunkRepo = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    userRepo = {
      findOneBy: jest.fn(),
    };
    dataExportService = {
      compileUserData: jest.fn(),
      convertToCsv: jest.fn(() => 'test,csv'),
      markExportFailed: jest.fn(),
      markExportProcessing: jest.fn(),
      // Issue #1453 helpers
      getResumeIndex: jest
        .fn()
        .mockResolvedValue(-1), // By default: nothing persisted yet.
      getChunksForRequest: jest.fn().mockResolvedValue([]),
      saveCompletedChunk: jest.fn().mockResolvedValue(true),
      markChunkFailed: jest.fn().mockResolvedValue({
        at: new Date().toISOString(),
        code: 'CHUNK_WRITE_FAILED',
        message: 'simulated failure',
        isRetryable: true,
      }),
      verifyArchiveIntegrity: jest.fn().mockResolvedValue(undefined),
    };
    auditLogService = {
      logExportLifecycleEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportProcessor,
        {
          provide: getRepositoryToken(ExportRequest),
          useValue: exportRepo,
        },
        {
          provide: getRepositoryToken(ExportChunk),
          useValue: chunkRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
        {
          provide: DataExportService,
          useValue: dataExportService,
        },
        {
          provide: EmailService,
          useValue: { sendWelcomeEmail: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: auditLogService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    processor = module.get<ExportProcessor>(ExportProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleExport (legacy / happy path)', () => {
    it('should process a chunked export successfully', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-1' },
      } as Job;

      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      userRepo.findOneBy.mockResolvedValue({
        id: 1,
        emailEncrypted: 'test@example.com',
        username: 'testuser',
      });

      await processor.process(mockJob);

      expect(dataExportService.compileUserData).toHaveBeenCalled();
      expect(dataExportService.markExportProcessing).toHaveBeenCalledWith(
        'req-1',
      );
      expect(exportRepo.update).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({
          status: 'READY',
          isChunked: true,
        }),
      );
      // Integrity verification must run before declaring READY.
      expect(
        dataExportService.verifyArchiveIntegrity,
      ).toHaveBeenCalled();
    });

    it('should mark export as FAILED if error occurs', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-1' },
      } as Job;

      dataExportService.compileUserData.mockRejectedValue(
        new Error('Test error'),
      );

      await expect(processor.process(mockJob)).rejects.toThrow();
      expect(dataExportService.markExportProcessing).toHaveBeenCalledWith(
        'req-1',
      );
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-1',
        'Test error',
      );
    });

    it('should mark export as FAILED when archive integrity verification fails', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-1' },
      } as Job;

      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      dataExportService.verifyArchiveIntegrity.mockRejectedValue(
        new BadRequestException({
          message:
            'Archive integrity verification failed: combined checksum mismatch with in-memory hash.',
          code: 'ARCHIVE_INTEGRITY_FAILED',
        }),
      );

      await expect(processor.process(mockJob)).rejects.toThrow();
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-1',
        expect.stringContaining('Archive integrity verification failed'),
      );
      // Should not declare READY when integrity fails.
      expect(exportRepo.update).not.toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({ status: 'READY' }),
      );
    });

    it('should emit export_integrity_verification_failed audit event on integrity failure', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '42', requestId: 'req-audit-1' },
      } as Job;

      dataExportService.compileUserData.mockResolvedValue({
        userId: '42',
        confessions: [{ id: 1, message: 'hello' }],
      });
      userRepo.findOneBy.mockResolvedValue(null);
      dataExportService.verifyArchiveIntegrity.mockRejectedValue(
        new BadRequestException({
          message:
            'Archive integrity verification failed: combined checksum mismatch with in-memory hash.',
          code: 'ARCHIVE_INTEGRITY_FAILED',
        }),
      );

      await expect(processor.process(mockJob)).rejects.toThrow();

      expect(auditLogService.logExportLifecycleEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'integrity_verification_failed',
          requestId: 'req-audit-1',
          exportId: 'req-audit-1',
          actorType: 'system',
          metadata: expect.objectContaining({
            userId: '42',
            integrityCode: 'ARCHIVE_INTEGRITY_FAILED',
            reason: expect.stringContaining('Archive integrity'),
          }),
        }),
      );
    });

    it('does not block the failure path when audit emission itself throws', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-audit-2' },
      } as Job;

      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      dataExportService.verifyArchiveIntegrity.mockRejectedValue(
        new BadRequestException({
          message: 'Archive integrity verification failed: corrupt chunk 0.',
          code: 'ARCHIVE_INTEGRITY_FAILED',
        }),
      );
      auditLogService.logExportLifecycleEvent.mockRejectedValueOnce(
        new Error('audit db down'),
      );

      await expect(processor.process(mockJob)).rejects.toThrow(
        /Archive integrity/,
      );
      // markExportFailed still runs because the audit failure is swallowed.
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-audit-2',
        expect.stringContaining('Archive integrity'),
      );
    });
  });

  // ── Issue #1453: resumability + idempotent resume ──────────────────────────

  describe('Issue #1453 — resumable processor', () => {
    it('resolves the resume index before generating the zip', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-resume' },
      } as Job;

      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      userRepo.findOneBy.mockResolvedValue(null);

      await processor.process(mockJob);

      expect(dataExportService.getResumeIndex).toHaveBeenCalledWith(
        'req-resume',
      );
    });

    it('skips DB writes for chunks whose index is <= resumeIndex', async () => {
      // Simulate that two chunks were already durably saved before the crash.
      dataExportService.getResumeIndex.mockResolvedValue(1);
      // Stub integrity verification so the test asserts only resume behavior.
      dataExportService.verifyArchiveIntegrity.mockResolvedValue(undefined);

      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-resume' },
      } as Job;

      // Generate enough payload to cross two 10MB thresholds so we can
      // observe both a "skipped" chunk (index 0 or 1) and a "new" chunk.
      const confessions = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        message: 'A'.repeat(1024 * 1024), // 1MB raw — yields 30MB JSON
      }));
      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions,
      });
      userRepo.findOneBy.mockResolvedValue(null);

      await processor.process(mockJob);

      // The resume ask must have happened.
      expect(dataExportService.getResumeIndex).toHaveBeenCalledWith(
        'req-resume',
      );
      // saveCompletedChunk must have been called for at least one chunk
      // (the new, post-resume range)…
      const writeCalls = dataExportService.saveCompletedChunk.mock.calls;
      expect(writeCalls.length).toBeGreaterThan(0);

      // …but never for index 0 or 1 — those are skipped.
      const writtenIndexes = writeCalls
        .map((c: any[]) => c[1])
        .filter((n) => typeof n === 'number');
      expect(writtenIndexes.every((i: number) => i > 1)).toBe(true);
    });

    it('deduplicates via saveCompletedChunk even when called repeatedly', async () => {
      // Have the helper return false the second time it's invoked to
      // simulate the unique-index dedupe path.
      dataExportService.saveCompletedChunk
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false);
      dataExportService.verifyArchiveIntegrity.mockResolvedValue(undefined);

      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-dedupe' },
      } as Job;

      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      // Resume says chunk 0 is done, so processor never invokes saveCompletedChunk
      // for index 0 — but we want to exercise the dedupe handler.
      dataExportService.getResumeIndex.mockResolvedValue(-1);
      userRepo.findOneBy.mockResolvedValue(null);

      await processor.process(mockJob);

      // No matter what write order the producer takes, the helper is the
      // single source of truth for dedup — the processor should not call
      // chunkRepository.save directly at all.
      expect(chunkRepo.save).not.toHaveBeenCalled();
    });

    it('records a failed chunk with sanitized, non-sensitive metadata when save throws', async () => {
      // Make the in-stream chunk save throw to simulate a worker crash.
      dataExportService.saveCompletedChunk.mockRejectedValueOnce(
        new Error('something leaked@example.com 12345678901234567890123456789012'),
      );
      dataExportService.verifyArchiveIntegrity.mockResolvedValue(undefined);

      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-fail' },
      } as Job;
      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(processor.process(mockJob)).rejects.toThrow();

      expect(dataExportService.markChunkFailed).toHaveBeenCalled();
      const [calledRequestId, calledIndex, calledError] =
        dataExportService.markChunkFailed.mock.calls[0];
      expect(calledRequestId).toBe('req-fail');
      expect(typeof calledIndex).toBe('number');
      // The original raw error was passed in; sanitization happens inside
      // the service helper.
      expect(calledError).toBeInstanceOf(Error);
    });

    it('does NOT mark export READY if the chunk stream signals a recorded failure', async () => {
      const dbError = new Error('boom');
      dataExportService.saveCompletedChunk.mockRejectedValue(dbError);
      dataExportService.verifyArchiveIntegrity.mockResolvedValue(undefined);

      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-fail-2' },
      } as Job;
      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(processor.process(mockJob)).rejects.toThrow();
      expect(dataExportService.markChunkFailed).toHaveBeenCalled();
      // markExportFailed is invoked from the outer try/catch with the
      // generic 'one or more chunks did not complete' message.
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-fail-2',
        expect.stringContaining('one or more chunks did not complete'),
      );
    });

    it('does NOT directly hit chunkRepository.save (dedupe is delegated to the service)', async () => {
      dataExportService.saveCompletedChunk.mockResolvedValue(true);
      dataExportService.verifyArchiveIntegrity.mockResolvedValue(undefined);

      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-clean' },
      } as Job;
      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      userRepo.findOneBy.mockResolvedValue(null);

      await processor.process(mockJob);

      expect(chunkRepo.save).not.toHaveBeenCalled();
      expect(chunkRepo.find).not.toHaveBeenCalled();
      expect(chunkRepo.findOne).not.toHaveBeenCalled();
    });

    it('rerunning the same job (worker restart) calls getResumeIndex again each time', async () => {
      dataExportService.verifyArchiveIntegrity.mockResolvedValue(undefined);

      const makeJob = () =>
        ({
          name: 'process-export',
          data: { userId: '1', requestId: 'req-restart' },
        } as Job);

      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      // First call: nothing persisted yet. Second call: one chunk exists.
      dataExportService.getResumeIndex
        .mockResolvedValueOnce(-1)
        .mockResolvedValueOnce(0);
      userRepo.findOneBy.mockResolvedValue(null);

      await processor.process(makeJob());
      await processor.process(makeJob());

      expect(dataExportService.getResumeIndex).toHaveBeenCalledTimes(2);
      expect(dataExportService.getResumeIndex).toHaveBeenNthCalledWith(
        1,
        'req-restart',
      );
      expect(dataExportService.getResumeIndex).toHaveBeenNthCalledWith(
        2,
        'req-restart',
      );
    });

    it('still invokes verifyArchiveIntegrity before marking READY on a resume', async () => {
      dataExportService.getResumeIndex.mockResolvedValue(2);
      dataExportService.verifyArchiveIntegrity.mockResolvedValue(undefined);

      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-resume-verify' },
      } as Job;
      dataExportService.compileUserData.mockResolvedValue({
        userId: '1',
        confessions: [{ id: 1, message: 'hello' }],
      });
      userRepo.findOneBy.mockResolvedValue(null);

      await processor.process(mockJob);

      expect(dataExportService.verifyArchiveIntegrity).toHaveBeenCalledTimes(1);
      expect(exportRepo.update).toHaveBeenCalledWith(
        'req-resume-verify',
        expect.objectContaining({ status: 'READY' }),
      );
    });
  });
});
