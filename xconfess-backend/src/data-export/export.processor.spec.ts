import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExportProcessor } from './export.processor';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { User } from '../user/entities/user.entity';
import { DataExportService } from './data-export.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';

describe('ExportProcessor', () => {
  let processor: ExportProcessor;
  let exportRepo: any;
  let chunkRepo: any;
  let userRepo: any;
  let dataExportService: any;

  beforeEach(async () => {
    exportRepo = {
      update: jest.fn(),
    };
    chunkRepo = {
      save: jest.fn(),
    };
    userRepo = {
      findOneBy: jest.fn(),
    };
    dataExportService = {
      compileUserData: jest.fn(),
      convertToCsv: jest.fn(() => 'test,csv'),
      markExportFailed: jest.fn(),
      markExportProcessing: jest.fn(),
      cleanupPartialChunks: jest.fn(),
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

  describe('handleExport', () => {
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
      expect(chunkRepo.save).toHaveBeenCalled();
    });

    it('should mark export as FAILED if error occurs', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-1' },
      } as Job;

      dataExportService.compileUserData.mockRejectedValue(
        new Error('Test error'),
      );

      await processor.process(mockJob);

      expect(dataExportService.markExportProcessing).toHaveBeenCalledWith(
        'req-1',
      );
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-1',
        'Test error',
      );
    });

    it('should not update status to READY when compilation fails', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-fail' },
      } as Job;

      dataExportService.compileUserData.mockRejectedValue(
        new Error('timeout'),
      );

      await processor.process(mockJob);

      expect(exportRepo.update).not.toHaveBeenCalledWith(
        'req-fail',
        expect.objectContaining({ status: 'READY' }),
      );
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-fail',
        'timeout',
      );
    });

    it('should call markExportFailed with error message on any failure', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '1', requestId: 'req-err' },
      } as Job;

      dataExportService.markExportProcessing.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await processor.process(mockJob);

      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-err',
        'DB connection lost',
      );
    });

    it('should skip processing for non-process-export job names', async () => {
      const mockJob = {
        name: 'other-job',
        data: { userId: '1', requestId: 'req-skip' },
      } as Job;

      await processor.process(mockJob);

      expect(dataExportService.markExportProcessing).not.toHaveBeenCalled();
      expect(dataExportService.markExportFailed).not.toHaveBeenCalled();
    });
  });

  // ── Issue #2156 — idempotent retries and partial chunk cleanup ───────────

  describe('idempotency and partial-chunk cleanup (#2156)', () => {
    it('calls cleanupPartialChunks before writing new chunks so a retry starts clean', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '2', requestId: 'req-retry' },
      } as Job;

      dataExportService.compileUserData.mockResolvedValue({
        userId: '2',
        confessions: [],
      });
      userRepo.findOneBy.mockResolvedValue(null);

      const callOrder: string[] = [];
      dataExportService.cleanupPartialChunks.mockImplementation(async () => {
        callOrder.push('cleanupPartialChunks');
      });
      dataExportService.compileUserData.mockImplementation(async () => {
        callOrder.push('compileUserData');
        return { userId: '2', confessions: [] };
      });

      await processor.process(mockJob);

      // cleanupPartialChunks must be called before data compilation.
      expect(callOrder.indexOf('cleanupPartialChunks')).toBeLessThan(
        callOrder.indexOf('compileUserData'),
      );
    });

    it('cleans up partial chunks before marking the job failed when compilation throws', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '3', requestId: 'req-fail-clean' },
      } as Job;

      dataExportService.compileUserData.mockRejectedValue(
        new Error('disk full'),
      );

      await processor.process(mockJob);

      // On failure the processor must clean up any partial chunks that were
      // written before the error (Issue #2156).
      expect(dataExportService.cleanupPartialChunks).toHaveBeenCalledWith(
        'req-fail-clean',
      );
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-fail-clean',
        'disk full',
      );
    });

    it('still marks the job failed even when cleanupPartialChunks itself throws', async () => {
      const mockJob = {
        name: 'process-export',
        data: { userId: '4', requestId: 'req-cleanup-err' },
      } as Job;

      dataExportService.compileUserData.mockRejectedValue(
        new Error('timeout'),
      );
      dataExportService.cleanupPartialChunks.mockRejectedValue(
        new Error('cleanup DB error'),
      );

      // Must not throw — the processor swallows cleanup errors and proceeds
      // to markExportFailed (Issue #2156).
      await expect(processor.process(mockJob)).resolves.not.toThrow();
      expect(dataExportService.markExportFailed).toHaveBeenCalledWith(
        'req-cleanup-err',
        'timeout',
      );
    });
  });
});
