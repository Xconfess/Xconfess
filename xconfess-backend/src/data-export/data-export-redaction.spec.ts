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
import * as fixtures from './data-export-fixtures';

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

  describe('Redaction Logic - Confessions', () => {
    it('should NOT redact active normal confessions', () => {
      const result = (service as any).redactConfessionForExport(
        fixtures.mockConfessionNormal,
        fixtures.mockUserActive,
      );

      expect(result.message).toBe(fixtures.mockConfessionNormal.message);
      expect(result._redacted).toBe(false);
    });

    it('should redact deleted confessions', () => {
      const result = (service as any).redactConfessionForExport(
        fixtures.mockConfessionDeleted,
        fixtures.mockUserActive,
      );

      expect(result.message).toBe('[REDACTED: Content was deleted]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('deleted');
      // Verify safe metadata preservation
      expect(result.id).toBe(fixtures.mockConfessionDeleted.id);
      expect(result.deletedAt).toBe(fixtures.mockConfessionDeleted.deletedAt);
    });

    it('should redact moderated (rejected) confessions', () => {
      const result = (service as any).redactConfessionForExport(
        fixtures.mockConfessionModerated,
        fixtures.mockUserActive,
      );

      expect(result.message).toBe('[REDACTED: Content was removed by moderation]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('moderated');
      // Verify safe metadata preservation
      expect(result.moderationStatus).toBe('rejected');
      expect(result.metadata.moderationScore).toBe(0.99);
    });

    it('should redact hidden confessions', () => {
      const result = (service as any).redactConfessionForExport(
        fixtures.mockConfessionHidden,
        fixtures.mockUserActive,
      );

      expect(result.message).toBe('[REDACTED: Content was removed by moderation]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('moderated');
    });

    it('should redact content for deactivated users', () => {
      const result = (service as any).redactConfessionForExport(
        fixtures.mockConfessionNormal,
        fixtures.mockUserDeactivated,
      );

      expect(result.message).toBe('[REDACTED: User account deactivated]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('user_deactivated');
    });
  });

  describe('Redaction Logic - Comments', () => {
    it('should NOT redact normal comments for active users', () => {
      const result = (service as any).redactCommentForExport(
        fixtures.mockCommentNormal,
        fixtures.mockUserActive,
      );

      expect(result.content).toBe(fixtures.mockCommentNormal.content);
      expect(result._redacted).toBe(false);
    });

    it('should redact deleted comments', () => {
      const result = (service as any).redactCommentForExport(
        fixtures.mockCommentDeleted,
        fixtures.mockUserActive,
      );

      expect(result.content).toBe('[REDACTED: Comment was deleted]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('deleted');
    });

    it('should redact moderated comments', () => {
      const result = (service as any).redactCommentForExport(
        fixtures.mockCommentModerated,
        fixtures.mockUserActive,
      );

      expect(result.content).toBe('[REDACTED: Comment was removed by moderation]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('moderated');
    });

    it('should redact comments for deactivated users', () => {
      const result = (service as any).redactCommentForExport(
        fixtures.mockCommentNormal,
        fixtures.mockUserDeactivated,
      );

      expect(result.content).toBe('[REDACTED: User account deactivated]');
      expect(result._redacted).toBe(true);
    });
  });

  describe('Redaction Logic - Messages', () => {
    it('should NOT redact normal messages for active users', () => {
      const result = (service as any).redactMessageForExport(
        fixtures.mockMessageNormal,
        fixtures.mockUserActive,
      );

      expect(result.content).toBe(fixtures.mockMessageNormal.content);
      expect(result._redacted).toBe(false);
    });

    it('should redact deleted messages', () => {
      const result = (service as any).redactMessageForExport(
        fixtures.mockMessageDeleted,
        fixtures.mockUserActive,
      );

      expect(result.content).toBe('[REDACTED: Message was deleted]');
      expect(result._redacted).toBe(true);
      expect(result._reason).toBe('deleted');
    });

    it('should redact messages for deactivated users', () => {
      const result = (service as any).redactMessageForExport(
        fixtures.mockMessageNormal,
        fixtures.mockUserDeactivated,
      );

      expect(result.content).toBe('[REDACTED: User account deactivated]');
      expect(result.replyContent).toBe('[REDACTED: User account deactivated]');
      expect(result._redacted).toBe(true);
    });
  });

  describe('Export Policy Summary', () => {
    it('should include correct redaction flags for deactivated user in compileUserData', async () => {
      // Mocking compileUserData requirements
      const userRepo = { findOne: jest.fn().mockResolvedValue(fixtures.mockUserDeactivated) };
      const confessionRepo = { 
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        })
      };
      const commentRepo = { 
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        })
      };
      const messageRepo = { 
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        })
      };

      (service as any).exportRepository.manager.getRepository = jest.fn((entity) => {
        if (entity === 'User') return userRepo;
        if (entity === 'AnonymousConfession') return confessionRepo;
        if (entity === 'Comment') return commentRepo;
        if (entity === 'Message') return messageRepo;
      });

      const result = await service.compileUserData('user-2');
      
      expect(result.userStatus).toBe('deactivated');
      expect(result._redactionPolicy.deactivatedUserContentMasked).toBe(true);
    });
  });
});

