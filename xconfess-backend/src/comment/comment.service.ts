import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import {
  OutboxEvent,
  OutboxStatus,
} from '../common/entities/outbox-event.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { User } from '../user/entities/user.entity';
import {
  CommentSortField,
  GetCommentsQueryDto,
  SortOrder,
} from './dto/get-comments-query.dto';
import { Comment } from './entities/comment.entity';
import {
  ModerationComment,
  ModerationStatus,
} from './entities/moderation-comment.entity';
import {
  decodeCursor,
  encodeCursor,
  CursorPaginatedResponseDto,
} from '../common/pagination';

interface CommentCursor {
  id: number;
  createdAt: string;
}

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    @InjectRepository(Comment)
    private commentRepo: Repository<Comment>,
    @InjectRepository(AnonymousConfession)
    private confessionRepo: Repository<AnonymousConfession>,
    @InjectRepository(ModerationComment)
    private moderationCommentRepo: Repository<ModerationComment>,
    @InjectRepository(OutboxEvent)
    private outboxRepo: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
    private readonly analyticsService: AnalyticsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    content: string,
    user: AnonymousUser,
    confessionId: string,
    anonymousContextId: string,
    parentId?: number,
  ): Promise<Comment> {
    const confession = await this.confessionRepo.findOne({
      where: { id: confessionId, isDeleted: false },
      relations: [
        'anonymousUser',
        'anonymousUser.userLinks',
        'anonymousUser.userLinks.user',
      ],
    });

    if (!confession) {
      throw new NotFoundException('Confession not found');
    }

    return this.dataSource
      .transaction(async (manager) => {
        // ... (existing comment creation logic)
        const commentRepo = manager.getRepository(Comment);
        const moderationRepo = manager.getRepository(ModerationComment);
        const outboxRepo = manager.getRepository(OutboxEvent);

        const comment = commentRepo.create({
          content,
          anonymousUser: user,
          confession,
          anonymousContextId,
        });

        if (parentId) {
          const parentComment = new Comment();
          parentComment.id = parentId;
          comment.parent = parentComment;
        }

        const savedComment = await commentRepo.save(comment);

        // Add moderation entry
        await moderationRepo.save(
          moderationRepo.create({
            comment: savedComment,
            commentId: savedComment.id,
            status: ModerationStatus.PENDING,
          }),
        );

        // 4. Create Outbox Event for notification
        const recipientEmail = this.getRecipientEmail(confession.anonymousUser);
        if (recipientEmail) {
          const payload = {
            commentId: savedComment.id,
            confessionId: confession.id,
            recipientEmail,
            commenterContextId: anonymousContextId,
            commentPreview: content.substring(0, 100),
          };

          const idempotencyKey = `comment:${savedComment.id}`;

          await outboxRepo.save(
            outboxRepo.create({
              type: 'comment_notification',
              payload,
              idempotencyKey,
              status: OutboxStatus.PENDING,
            }),
          );
        }

        return savedComment;
      })
      .then(async (result) => {
        // Invalidate trending analytics after a new comment lands.
        // Fire-and-forget: cache failures must not roll back the comment write.
        this.analyticsService
          .invalidateTrendingCache('comment-created')
          .catch((err) =>
            this.logger.error(
              'Failed to invalidate trending cache after comment create',
              err,
            ),
          );
        return result;
      });
  }

  private getRecipientEmail(anonymousUser: AnonymousUser): string | null {
    if (!anonymousUser) return null;

    // Find linked user
    const link = anonymousUser.userLinks?.[0];
    if (link?.user) {
      return link.user.getEmail();
    }

    return null;
  }

  /**
   * Parse cursor from base64 encoded string
   */
  private parseCursor(cursor?: string): CommentCursor | undefined {
    return decodeCursor<CommentCursor>(cursor);
  }

  /**
   * Create cursor from comment
   */
  private createCursor(comment: Comment): string {
    return encodeCursor({
      id: comment.id,
      createdAt: comment.createdAt.toISOString(),
    });
  }

  /**
   * Build stable ordering for cursor pagination
   */
  private buildOrdering(
    sortField: CommentSortField,
    sortOrder: SortOrder,
    cursor?: CommentCursor,
  ): {
    orderBy: string;
    orderDirection: 'ASC' | 'DESC';
    whereCondition: string;
  } {
    const orderDirection = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

    switch (sortField) {
      case CommentSortField.CREATED_AT:
        if (cursor) {
          // Use composite ordering for stability
          const operator = sortOrder === SortOrder.ASC ? '>' : '<';
          const tieBreakOperator = sortOrder === SortOrder.ASC ? '>=' : '<=';
          return {
            orderBy: 'comment.createdAt, comment.id',
            orderDirection,
            whereCondition: `(comment.createdAt ${operator} :cursorDate OR (comment.createdAt = :cursorDate AND comment.id ${tieBreakOperator} :cursorId))`,
          };
        }
        return {
          orderBy: 'comment.createdAt, comment.id',
          orderDirection,
          whereCondition: '',
        };

      case CommentSortField.ID:
        if (cursor) {
          const operator = sortOrder === SortOrder.ASC ? '>' : '<';
          return {
            orderBy: 'comment.id',
            orderDirection,
            whereCondition: `comment.id ${operator} :cursorId`,
          };
        }
        return {
          orderBy: 'comment.id',
          orderDirection,
          whereCondition: '',
        };

      default:
        throw new BadRequestException('Unsupported sort field');
    }
  }

  /**
   * Find comments by confession ID with stable cursor pagination
   */
  async findByConfessionId(
    confessionId: string,
    queryDto: GetCommentsQueryDto,
  ): Promise<CursorPaginatedResponseDto<Comment>> {
    const {
      cursor,
      sortField,
      sortOrder,
      limit,
      page,
      includeOrphanedReplies,
    } = queryDto;

    // Parse cursor if provided
    const parsedCursor = this.parseCursor(cursor);

    // Build stable ordering
    const { orderBy, orderDirection, whereCondition } = this.buildOrdering(
      sortField!,
      sortOrder!,
      parsedCursor,
    );

    // Determine actual limit
    const actualLimit = limit!;
    const fetchLimit = actualLimit + 1; // Fetch one extra to determine if there are more results

    const qb = this.commentRepo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.confession', 'confession')
      .leftJoinAndSelect('comment.anonymousUser', 'anonymousUser')
      .leftJoinAndSelect('comment.parent', 'parent')
      .leftJoinAndSelect('comment.replies', 'replies')
      .innerJoin(
        'moderation_comments',
        'moderation',
        'moderation.commentId = comment.id',
      )
      .where('comment.confession = :confessionId', { confessionId })
      .andWhere('comment.isDeleted = false')
      .andWhere('moderation.status = :status', {
        status: ModerationStatus.APPROVED,
      });

    // Add cursor condition if present
    if (parsedCursor && whereCondition) {
      qb.andWhere(whereCondition, {
        cursorDate: parsedCursor.createdAt,
        cursorId: parsedCursor.id,
      });
    }

    // Handle orphaned replies
    if (!includeOrphanedReplies) {
      qb.andWhere(
        '(comment.parent IS NULL OR comment.parent.isDeleted = false)',
      );
    }

    // For page-based pagination, only paginate top-level comments
    if (!cursor && page && page > 1) {
      qb.andWhere('comment.parent IS NULL');
      const skip = (page - 1) * actualLimit;
      qb.skip(skip);
    } else if (!cursor) {
      // Default behavior for first page without cursor: only top-level comments for cleaner threads
      qb.andWhere('comment.parent IS NULL');
    }

    // Apply ordering and limit
    qb.orderBy(orderBy, orderDirection).take(fetchLimit);

    const comments = await qb.getMany();

    // Determine if there are more results
    const hasMore = comments.length > actualLimit;
    const resultComments = hasMore ? comments.slice(0, actualLimit) : comments;

    // Generate next cursor if there are more results
    let nextCursor: string | null = null;
    if (hasMore && resultComments.length > 0) {
      const lastComment = resultComments[resultComments.length - 1];
      nextCursor = this.createCursor(lastComment);
    }

    return new CursorPaginatedResponseDto(
      resultComments,
      nextCursor,
      hasMore,
      actualLimit,
    );
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use findByConfessionId with GetCommentsQueryDto instead
   */
  async findByConfessionIdLegacy(
    confessionId: string,
    opts?: { page?: number; limit?: number },
  ): Promise<Comment[]> {
    const queryDto: GetCommentsQueryDto = {
      page: opts?.page || 1,
      limit: opts?.limit || 20,
      sortField: CommentSortField.CREATED_AT,
      sortOrder: SortOrder.DESC,
      includeOrphanedReplies: false,
    };

    const result = await this.findByConfessionId(confessionId, queryDto);
    return result.data;
  }

  async delete(id: number, user: AnonymousUser): Promise<void> {
    const comment = await this.commentRepo.findOne({
      where: { id, isDeleted: false },
      relations: ['anonymousUser'],
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.anonymousUser.id !== user.id) {
      throw new BadRequestException('You can only delete your own comments');
    }

    await this.commentRepo.update(id, { isDeleted: true });

    // A deleted comment changes visible engagement counts.
    this.analyticsService
      .invalidateTrendingCache('comment-deleted')
      .catch((err) =>
        this.logger.error(
          'Failed to invalidate trending cache after comment delete',
          err,
        ),
      );
  }

  async moderateComment(
    commentId: number,
    status: ModerationStatus,
    moderator: User,
  ): Promise<{ success: boolean; message: string }> {
    const moderation = await this.moderationCommentRepo.findOne({
      where: { comment: { id: commentId } },
      relations: ['comment'],
    });
    if (!moderation) {
      throw new NotFoundException('Moderation entry not found for comment');
    }
    if (moderation.status !== ModerationStatus.PENDING) {
      throw new BadRequestException('Comment has already been moderated');
    }
    moderation.status = status;
    moderation.moderatedAt = new Date();
    moderation.moderatedBy = moderator;
    moderation.moderatedById = moderator.id;
    await this.moderationCommentRepo.save(moderation);

    // Audit-log the moderation action with comment id and actor.
    const auditAction =
      status === ModerationStatus.APPROVED
        ? AuditActionType.COMMENT_APPROVED
        : AuditActionType.COMMENT_REJECTED;
    this.auditLogService
      .log({
        actionType: auditAction,
        metadata: {
          commentId,
          entityType: 'comment',
          entityId: String(commentId),
          moderationStatus: status,
          moderatedAt: moderation.moderatedAt.toISOString(),
        },
        context: {
          userId: moderator.id,
          actor: { type: 'admin', id: String(moderator.id) },
        },
      })
      .catch((err) =>
        this.logger.error(
          `Failed to create audit log for comment ${commentId} ${status}: ${err}`,
          err,
        ),
      );

    // Moderation changes which comments are publicly visible, directly
    // affecting trending scores and platform stats.
    this.analyticsService
      .invalidateTrendingCache(`comment-moderated:${status}`)
      .catch((err) =>
        this.logger.error(
          'Failed to invalidate trending cache after moderation',
          err,
        ),
      );
    this.analyticsService
      .invalidateStatsCache(`comment-moderated:${status}`)
      .catch((err) =>
        this.logger.error(
          'Failed to invalidate stats cache after moderation',
          err,
        ),
      );

    return { success: true, message: `Comment ${status}` };
  }
}
