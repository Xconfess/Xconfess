import { Test, TestingModule } from '@nestjs/testing';
import { CommentService } from '../comment.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditActionType } from '../../audit-log/audit-log.entity';
import { ModerationStatus } from '../entities/moderation-comment.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Comment } from '../entities/comment.entity';
import { AnonymousConfession } from '../../confession/entities/confession.entity';
import { ModerationComment } from '../entities/moderation-comment.entity';
import { OutboxEvent } from '../../common/entities/outbox-event.entity';
import { AnalyticsService } from '../../analytics/analytics.service';
import { User } from '../../user/entities/user.entity';

describe('CommentService — audit logging', () => {
  let service: CommentService;
  let auditLogService: jest.Mocked<AuditLogService>;
  let moderationCommentRepo: jest.Mocked<Repository<ModerationComment>>;

  const mockModeration = {
    id: 1,
    comment: { id: 42, content: 'test comment' },
    status: ModerationStatus.PENDING,
    moderatedAt: null,
    moderatedBy: null,
    moderatedById: null,
  };

  const mockModerator = {
    id: 1,
    username: 'admin_user',
    role: 'admin',
  } as User;

  beforeEach(async () => {
    auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as any;

    moderationCommentRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        {
          provide: getRepositoryToken(Comment),
          useValue: {} as Repository<Comment>,
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {} as Repository<AnonymousConfession>,
        },
        {
          provide: getRepositoryToken(ModerationComment),
          useValue: moderationCommentRepo,
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: {} as Repository<OutboxEvent>,
        },
        {
          provide: DataSource,
          useValue: {} as DataSource,
        },
        {
          provide: AnalyticsService,
          useValue: {
            invalidateTrendingCache: jest.fn().mockResolvedValue(undefined),
            invalidateStatsCache: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditLogService,
          useValue: auditLogService,
        },
      ],
    }).compile();

    service = module.get<CommentService>(CommentService);
  });

  describe('moderateComment() — audit log on approve', () => {
    it('writes COMMENT_APPROVED audit log when comment is approved', async () => {
      moderationCommentRepo.findOne.mockResolvedValue(mockModeration as any);
      moderationCommentRepo.save.mockResolvedValue({
        ...mockModeration,
        status: ModerationStatus.APPROVED,
        moderatedAt: new Date(),
        moderatedBy: mockModerator,
        moderatedById: mockModerator.id,
      } as any);

      await service.moderateComment(42, ModerationStatus.APPROVED, mockModerator);

      expect(auditLogService.log).toHaveBeenCalledTimes(1);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.COMMENT_APPROVED,
          metadata: expect.objectContaining({
            entityType: 'comment',
            entityId: '42',
            commentId: '42',
            previousStatus: ModerationStatus.PENDING,
            newStatus: ModerationStatus.APPROVED,
          }),
          context: expect.objectContaining({
            userId: mockModerator.id,
            actor: expect.objectContaining({
              type: 'admin',
              id: String(mockModerator.id),
              label: mockModerator.username,
              source: 'comment-admin-controller',
            }),
          }),
        }),
      );
    });

    it('writes COMMENT_REJECTED audit log when comment is rejected', async () => {
      moderationCommentRepo.findOne.mockResolvedValue(mockModeration as any);
      moderationCommentRepo.save.mockResolvedValue({
        ...mockModeration,
        status: ModerationStatus.REJECTED,
        moderatedAt: new Date(),
        moderatedBy: mockModerator,
        moderatedById: mockModerator.id,
      } as any);

      await service.moderateComment(42, ModerationStatus.REJECTED, mockModerator);

      expect(auditLogService.log).toHaveBeenCalledTimes(1);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.COMMENT_REJECTED,
          metadata: expect.objectContaining({
            entityType: 'comment',
            entityId: '42',
            newStatus: ModerationStatus.REJECTED,
          }),
        }),
      );
    });

    it('includes moderatedAt timestamp in audit metadata', async () => {
      const beforeModeration = new Date();
      moderationCommentRepo.findOne.mockResolvedValue(mockModeration as any);
      moderationCommentRepo.save.mockResolvedValue({
        ...mockModeration,
        status: ModerationStatus.APPROVED,
        moderatedAt: new Date(),
        moderatedBy: mockModerator,
        moderatedById: mockModerator.id,
      } as any);

      await service.moderateComment(42, ModerationStatus.APPROVED, mockModerator);

      const logCall = (auditLogService.log as jest.Mock).mock.calls[0][0];
      expect(logCall.metadata.moderatedAt).toBeDefined();
      expect(new Date(logCall.metadata.moderatedAt).getTime()).toBeGreaterThanOrEqual(
        beforeModeration.getTime(),
      );
    });

    it('does not throw when audit log write fails', async () => {
      moderationCommentRepo.findOne.mockResolvedValue(mockModeration as any);
      moderationCommentRepo.save.mockResolvedValue({
        ...mockModeration,
        status: ModerationStatus.APPROVED,
        moderatedAt: new Date(),
        moderatedBy: mockModerator,
        moderatedById: mockModerator.id,
      } as any);

      auditLogService.log.mockRejectedValueOnce(new Error('DB write failed'));

      // Should not throw — audit log failure must not break moderation
      await expect(
        service.moderateComment(42, ModerationStatus.APPROVED, mockModerator),
      ).resolves.not.toThrow();
    });
  });
});
