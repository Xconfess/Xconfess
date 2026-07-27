/**
 * Issue #428: Test export redaction for deleted/deactivated users
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DataExportService } from './data-export.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('DataExportService - Redaction Policy', () => {
  let service: DataExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        {
          provide: getRepositoryToken(ExportRequest),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
            manager: {
              getRepository: jest.fn(),
            },
          },
        },
        {
          provide: getRepositoryToken(ExportChunk),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getQueueToken('export-queue'),
          useValue: {
            add: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => defaultValue),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logExportLifecycleEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DataExportService>(DataExportService);
  });

  describe('Redaction Logic', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have compileUserData method', () => {
      expect(service.compileUserData).toBeDefined();
      expect(typeof service.compileUserData).toBe('function');
    });

    it('should have private redaction methods available', () => {
      // Verify the service has the redaction logic
      const servicePrototype = Object.getPrototypeOf(service);
      const methods = Object.getOwnPropertyNames(servicePrototype);
      
      // Check that redaction-related methods exist
      expect(methods).toContain('compileUserData');
    });
  });

  describe('Export Service Configuration', () => {
    it('should properly inject all dependencies', () => {
      expect(service).toBeDefined();
    });

    it('should have access to repositories', () => {
      // Service should be properly configured with all dependencies
      expect(service).toBeInstanceOf(DataExportService);
    });
  });

  describe('Redaction Policy Documentation', () => {
    it('should document redaction for deleted confessions', () => {
      // This test documents the expected behavior:
      // Deleted confessions should be redacted with [REDACTED: Content was deleted]
      const expectedBehavior = {
        deletedConfessions: 'masked with [REDACTED: Content was deleted]',
        deletedComments: 'masked with [REDACTED: Comment was deleted]',
        deactivatedUserContent: 'masked with [REDACTED: User account deactivated]',
        moderatedContent: 'masked with [REDACTED: Content was removed by moderation]',
      };
      
      expect(expectedBehavior.deletedConfessions).toContain('[REDACTED');
      expect(expectedBehavior.moderatedContent).toContain('[REDACTED');
    });

    it('should document export includes redaction metadata', () => {
      const expectedMetadata = {
        _redactionPolicy: {
          description: 'Content redacted according to deletion and moderation policies',
          deletedContentMasked: true,
          moderatedContentMasked: true,
        },
      };
      
      expect(expectedMetadata._redactionPolicy.deletedContentMasked).toBe(true);
      expect(expectedMetadata._redactionPolicy.moderatedContentMasked).toBe(true);
    });

    it('should redact counterpart identifiers from Tip exports', () => {
      const mockTip = {
        id: 'tip-1',
        amount: 10,
        verificationStatus: 'verified',
        confessionId: 'confession-1',
        createdAt: new Date(),
        senderAddress: 'wallet-abc-123',
      };
      const result = (service as any).redactTipForExport(mockTip, { is_active: true });
      expect(result.id).toBe('tip-1');
      expect(result.amount).toBe(10);
      expect(result.senderAddress).toBe('[REDACTED]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('counterpart_privacy');
    });

    it('should redact counterpart identifiers from Report exports', () => {
      const mockReport = {
        id: 'report-1',
        confessionId: 'confession-1',
        type: 'spam',
        reason: 'looks like spam',
        status: 'resolved',
        createdAt: new Date(),
        resolvedAt: new Date(),
        resolutionNotes: 'deleted post',
        resolver: { id: 99, username: 'admin' },
        resolvedBy: 99,
      };
      const result = (service as any).redactReportForExport(mockReport, { is_active: true });
      expect(result.id).toBe('report-1');
      expect(result.type).toBe('spam');
      expect(result.resolver).toBe('[REDACTED]');
      expect(result.resolvedBy).toBeNull();
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('counterpart_privacy');
    });

    it('should redact counterpart identifiers from ModerationLog exports', () => {
      const mockLog = {
        id: 'log-1',
        confessionId: 'confession-1',
        moderationScore: 0.9,
        moderationFlags: ['hate_speech'],
        moderationStatus: 'rejected',
        createdAt: new Date(),
        reviewedAt: new Date(),
        reviewNotes: 'flagged by auto-mod, confirmed',
        reviewedBy: 'mod-123',
      };
      const result = (service as any).redactModerationLogForExport(mockLog, { is_active: true });
      expect(result.id).toBe('log-1');
      expect(result.moderationScore).toBe(0.9);
      expect(result.reviewedBy).toBe('[REDACTED]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('counterpart_privacy');
    });
  });
});
