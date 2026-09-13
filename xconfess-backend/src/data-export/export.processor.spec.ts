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
});
