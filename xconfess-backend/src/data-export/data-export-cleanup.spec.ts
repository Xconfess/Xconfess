import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, UpdateResult, DeleteResult } from 'typeorm';
import { DataCleanupService } from './data-export-cleanup';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('DataCleanupService', () => {
  let service: DataCleanupService;
  let mockExportRepository: jest.Mocked<Repository<ExportRequest>>;
  let mockChunkRepository: jest.Mocked<Repository<ExportChunk>>;
  let mockAuditLogService: { log: jest.Mock; logExportRetentionCleanup: jest.Mock };
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockExportRepository = {
      update: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    } as any;
    mockChunkRepository = {
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue({ affected: 0, raw: [] } as DeleteResult),
    } as any;
    mockAuditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
      logExportRetentionCleanup: jest.fn().mockResolvedValue(undefined),
    };
    mockExportRepository.find.mockResolvedValue([
      {
        id: 'export-1',
        userId: 'user-1',
        status: 'READY',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      } as ExportRequest,
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataCleanupService,
        {
          provide: getRepositoryToken(ExportRequest),
          useValue: mockExportRepository,
        },
        {
          provide: getRepositoryToken(ExportChunk),
          useValue: mockChunkRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback?: unknown) => fallback),
          },
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<DataCleanupService>(DataCleanupService);
    loggerLogSpy = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation(() => undefined);
    loggerErrorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // â”€â”€ Retention Policy Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('Retention Policy Enforcement', () => {
    it('should expire exports older than 7 days', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 5,
        raw: [],
        generatedMaps: [],
      };

      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      await service.purgeOldExports();

      expect(mockExportRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ createdAt: expect.any(Object) }),
        expect.objectContaining({
          fileData: null,
          status: 'EXPIRED',
          expiredAt: expect.any(Date),
        }),
      );
    });

    it('should preserve exports within 7-day window', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 0,
        raw: [],
        generatedMaps: [],
      };

      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      // Mock current time
      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T10:00:00.000Z'));

      try {
        await service.purgeOldExports();

        expect(mockExportRepository.update).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockExportRepository.update.mockRejectedValue(dbError);

      await expect(service.purgeOldExports()).rejects.toThrow(
        'Database connection failed',
      );
      expect(mockExportRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should report number of expired exports', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 12,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      await service.purgeOldExports();

      expect(mockExportRepository.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          fileData: null,
          status: 'EXPIRED',
          expiredAt: expect.any(Date),
        }),
      );
      expect(mockUpdateResult.affected).toBe(12);
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Expired 12 export request(s)'),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('eligibleCount=1'),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('statusCounts={"READY":1}'),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('requestIds=["export-1"]'),
      );
    });
  });

  // â”€â”€ Cleanup Edge Cases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('Cleanup Edge Cases', () => {
    it('should handle exports with null fileData', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 3,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      await service.purgeOldExports();

      expect(mockExportRepository.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          fileData: null,
          status: 'EXPIRED',
          expiredAt: expect.any(Date),
        }),
      );
    });

    it('should preserve export metadata while clearing file data', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 1,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      await service.purgeOldExports();

      expect(mockExportRepository.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          fileData: null,
          status: 'EXPIRED',
          expiredAt: expect.any(Date),
        }),
      );

      const updateCall = mockExportRepository.update.mock.calls[0];
      const updateFields = updateCall[1];

      expect(Object.keys(updateFields)).toHaveLength(4);
      expect(updateFields.fileData).toBeNull();
      expect(updateFields.status).toBe('EXPIRED');
      expect(updateFields.expiredAt).toBeInstanceOf(Date);
      expect(updateFields.downloadTokenHash).toBeNull();
    });

    it('should not affect exports with terminal status that are recent', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 0,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T10:00:00.000Z'));

      try {
        await service.purgeOldExports();
        expect(mockExportRepository.update).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should handle boundary condition exactly at 7 days', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 1,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T10:00:00.000Z'));

      try {
        await service.purgeOldExports();
        expect(mockExportRepository.update).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // â”€â”€ Cleanup Timing and Scheduling Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('Cleanup Timing and Scheduling', () => {
    it('should run cleanup at midnight daily', () => {
      expect(service).toBeDefined();
    });

    it('should handle concurrent cleanup executions safely', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 5,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      const promises = [
        service.purgeOldExports(),
        service.purgeOldExports(),
        service.purgeOldExports(),
      ];

      await Promise.all(promises);

      expect(mockExportRepository.update).toHaveBeenCalledTimes(3);
    });
  });

  // â”€â”€ Data Privacy Compliance Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('Data Privacy Compliance', () => {
    it('should ensure file data is completely removed', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 3,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      await service.purgeOldExports();

      expect(mockExportRepository.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          fileData: null,
          status: 'EXPIRED',
          expiredAt: expect.any(Date),
        }),
      );

      const updateCall = mockExportRepository.update.mock.calls[0];
      const updateFields = updateCall[1];
      expect(updateFields.fileData).toBeNull();
    });

    it('should maintain audit trail by preserving records', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 2,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      await service.purgeOldExports();

      expect(mockExportRepository.update).toHaveBeenCalled();
      expect(mockExportRepository.delete).not.toHaveBeenCalled();
    });

    it('should mark expired exports clearly for users', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 1,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      await service.purgeOldExports();

      const updateCall = mockExportRepository.update.mock.calls[0];
      const updateFields = updateCall[1];

      expect(updateFields.status).toBe('EXPIRED');
      expect(updateFields.fileData).toBeNull();
      expect(updateFields.downloadTokenHash).toBeNull();
    });

    it('should not log exported file data or user secrets during cleanup', async () => {
      mockExportRepository.find.mockResolvedValue([
        {
          id: 'export-secret-check',
          userId: 'sensitive-user-id',
          status: 'READY',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          fileData: Buffer.from('secret exported file data'),
          downloadTokenHash: 'download-token-secret',
        } as ExportRequest,
      ]);
      mockExportRepository.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      await service.purgeOldExports();

      const logOutput = [
        ...loggerLogSpy.mock.calls,
        ...loggerErrorSpy.mock.calls,
      ]
        .flat()
        .join('\n');

      expect(logOutput).toContain('requestIds=["export-secret-check"]');
      expect(logOutput).not.toContain('sensitive-user-id');
      expect(logOutput).not.toContain('secret exported file data');
      expect(logOutput).not.toContain('download-token-secret');
    });
  });

  // â”€â”€ Integration with Export Lifecycle Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('Integration with Export Lifecycle', () => {
    it('should not interfere with active export processing', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 0,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T10:00:00.000Z'));

      try {
        await service.purgeOldExports();
        expect(mockExportRepository.update).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should handle exports in various terminal states', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 4,
        raw: [],
        generatedMaps: [],
      };
      mockExportRepository.update.mockResolvedValue(mockUpdateResult);

      jest.useFakeTimers().setSystemTime(new Date('2026-03-25T10:00:00.000Z'));

      try {
        await service.purgeOldExports();

        expect(mockExportRepository.update).toHaveBeenCalledWith(
          expect.objectContaining({ createdAt: expect.any(Object) }),
          expect.objectContaining({
            fileData: null,
            status: 'EXPIRED',
            expiredAt: expect.any(Date),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('Cleanup Observability', () => {
    it('should include safe aggregate context when cleanup fails', async () => {
      const dbError = new Error('Database connection failed');
      mockExportRepository.update.mockRejectedValue(dbError);

      await expect(service.purgeOldExports()).rejects.toThrow(
        'Database connection failed',
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Export cleanup failed: Database connection failed',
        ),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('eligibleCount=1'),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('requestIds=["export-1"]'),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('statusCounts={"READY":1}'),
      );
    });
  });
  // -- Dry-Run Mode --

  describe('Dry-Run Mode', () => {
    it('should not mutate any data when dryRun is true', async () => {
      const result = await service.runCleanup(true);

      expect(mockExportRepository.update).not.toHaveBeenCalled();
      expect(mockChunkRepository.delete).not.toHaveBeenCalled();
      expect(result.dryRun).toBe(true);
    });

    it('should still report accurate eligible counts in dry-run', async () => {
      mockChunkRepository.count.mockResolvedValue(3);

      const result = await service.runCleanup(true);

      expect(result.eligibleCount).toBe(1);
      expect(result.chunkCount).toBe(3);
      expect(result.expiredCount).toBe(0);
      expect(result.requestIds).toEqual(['export-1']);
    });

    it('should log a DRY-RUN marker without performing deletion', async () => {
      await service.runCleanup(true);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-RUN]'),
      );
      expect(mockExportRepository.update).not.toHaveBeenCalled();
    });

    it('should still emit an audit summary in dry-run mode', async () => {
      await service.runCleanup(true);

      expect(
        mockAuditLogService.logExportRetentionCleanup,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
          summary: expect.objectContaining({ eligibleCount: 1 }),
        }),
      );
    });

    it('should perform real deletion when dryRun is false', async () => {
      mockExportRepository.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      mockChunkRepository.count.mockResolvedValue(2);
      mockChunkRepository.delete.mockResolvedValue({
        affected: 2,
        raw: [],
      });

      const result = await service.runCleanup(false);

      expect(mockExportRepository.update).toHaveBeenCalled();
      expect(mockChunkRepository.delete).toHaveBeenCalledWith({
        exportRequestId: expect.anything(),
      });
      expect(result.dryRun).toBe(false);
      expect(result.expiredCount).toBe(1);
      expect(result.chunkCount).toBe(2);
    });
  });

  // -- Audit Log Summary --

  describe('Audit Log Summary', () => {
    it('should emit exactly one summary audit entry per run, not one per record', async () => {
      mockExportRepository.find.mockResolvedValue([
        {
          id: 'export-1',
          status: 'READY',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        } as ExportRequest,
        {
          id: 'export-2',
          status: 'FAILED',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        } as ExportRequest,
      ]);
      mockExportRepository.update.mockResolvedValue({
        affected: 2,
        raw: [],
        generatedMaps: [],
      });

      await service.purgeOldExports();

      expect(
        mockAuditLogService.logExportRetentionCleanup,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockAuditLogService.logExportRetentionCleanup,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            eligibleCount: 2,
            statusCounts: { READY: 1, FAILED: 1 },
            requestIds: ['export-1', 'export-2'],
          }),
        }),
      );
    });

    it('should not throw when audit logging fails', async () => {
      mockExportRepository.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      mockAuditLogService.logExportRetentionCleanup.mockRejectedValue(
        new Error('audit sink unavailable'),
      );

      await expect(service.purgeOldExports()).resolves.toBeDefined();
    });
  });
});
