import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { AnalyticsService } from "../analytics/analytics.service";
import {
  OutboxEvent,
  OutboxStatus,
} from "../common/entities/outbox-event.entity";
import { AnonymousConfession } from "../confession/entities/confession.entity";
import { AnonymousUser } from "../user/entities/anonymous-user.entity";
import { User } from "../user/entities/user.entity";
import {
  CommentSortField,
  GetCommentsQueryDto,
  SortOrder,
} from "./dto/get-comments-query.dto";
import { Comment } from "./entities/comment.entity";
import {
  ModerationComment,
  ModerationStatus,
} from "./entities/moderation-comment.entity";
import {
  decodeCursor,
  encodeCursor,
  CursorPaginatedResponseDto,
} from "../common/pagination";

// Edit window: 5 minutes in milliseconds
const EDIT_WINDOW_MS = 5 * 60 * 1000;

// Regex to extract @mentions from comment content
const MENTION_REGEX = /@([a-zA-Z0-9_]{1,50})/g;

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
  ) {}

  // ---------------------------------------------------------------------------
  // Mention parsing
  // ---------------------------------------------------------------------------

  /**
   * Extracts unique @mention usernames from comment content.
   * e.g. "hello @alice and @bob" -> ["alice", "bob"]
   */
  private parseMentions(content: string): string[] {
    const mentions: string[] = [];
    let match: RegExpExecArray | null;
    MENTION_REGEX.lastIndex = 0;
    while ((match = MENTION_REGEX.exec(content)) !== null) {
      const username = match[1];
      if (!mentions.includes(username)) {
        mentions.push(username);
      }
    }
    return mentions;
  }

  // ---------------------------------------------------------------------------
  // Create comment
  // ---------------------------------------------------------------------------

  async create(
    content: string,
    user: AnonymousUser,
    confessionId: string,
    anonymousContextId: string,
    parentId?: number,
    idempotencyKey?: string,
  ): Promise<Comment> {
    const confession = await this.confessionRepo.findOne({
      where: { id: confessionId, isDeleted: false },
      relations: [
        "anonymousUser",
        "anonymousUser.userLinks",
        "anonymousUser.userLinks.user",
      ],
    });

    if (!confession) {
      throw new NotFoundException("Confession not found");
    }

    // Enforce one level of nesting: reject replies to replies
    if (parentId) {
      const parent = await this.commentRepo.findOne({
        where: { id: parentId },
        relations: ["parent"],
      });
      if (!parent) {
        throw new NotFoundException("Parent comment not found");
      }
      if (parent.parentId) {
        throw new BadRequestException(
          "Replies to replies are not supported. You can only reply to top-level comments.",
        );
      }
    }

    // Idempotency: if a key is provided, return the existing comment (replay safety)
    if (idempotencyKey) {
      const existing = await this.commentRepo.findOne({
        where: { idempotencyKey },
        relations: ["anonymousUser", "replies"],
      });
      if (existing) {
        this.logger.debug(
          `Idempotent replay for key=${idempotencyKey}, returning comment ${existing.id}`,
        );
        return existing;
      }
    }

    const mentionedUsernames = this.parseMentions(content);

    return this.dataSource
      .transaction(async (manager) => {
        const commentRepo = manager.getRepository(Comment);
        const moderationRepo = manager.getRepository(ModerationComment);
        const outboxRepo = manager.getRepository(OutboxEvent);

        const comment = commentRepo.create({
          content,
          anonymousUser: user,
          confession,
          anonymousContextId,
          mentionedUsernames:
            mentionedUsernames.length > 0 ? mentionedUsernames : undefined,
          idempotencyKey: idempotencyKey || undefined,
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

        // Outbox event: notify confession owner of new comment
        // Skip if a notification was already enqueued for this comment (dedup)
        const recipientEmail = this.getRecipientEmail(confession.anonymousUser);
        if (recipientEmail) {
          const payload = {
            commentId: savedComment.id,
            confessionId: confession.id,
            recipientEmail,
            commenterContextId: anonymousContextId,
            commentPreview: content.substring(0, 100),
          };
          const commentNotifKey = idempotencyKey
            ? `comment:${idempotencyKey}`
            : `comment:${savedComment.id}`;
          await outboxRepo.save(
            outboxRepo.create({
              type: "comment_notification",
              payload,
              idempotencyKey: commentNotifKey,
              status: OutboxStatus.PENDING,
            }),
          );
        }

        // Outbox events: notify each @mentioned user (deduped per mention)
        for (const username of mentionedUsernames) {
          const mentionKey = idempotencyKey
            ? `mention:${idempotencyKey}:${username}`
            : `mention:${savedComment.id}:${username}`;
          await outboxRepo.save(
            outboxRepo.create({
              type: "mention_notification",
              payload: {
                commentId: savedComment.id,
                confessionId: confession.id,
                mentionedUsername: username,
                mentionedBy: anonymousContextId,
                commentPreview: content.substring(0, 100),
              },
              idempotencyKey: mentionKey,
              status: OutboxStatus.PENDING,
            }),
          );
        }

        return savedComment;
      })
      .then(async (result) => {
        this.analyticsService
          .invalidateTrendingCache("comment-created")
          .catch((err) =>
            this.logger.error(
              "Failed to invalidate trending cache after comment create",
              err,
            ),
          );
        return result;
      });
  }

  // ---------------------------------------------------------------------------
  // Edit comment (5-minute window)
  // ---------------------------------------------------------------------------

  async edit(
    id: number,
    newContent: string,
    user: AnonymousUser,
  ): Promise<Comment> {
    const comment = await this.commentRepo.findOne({
      where: { id, isDeleted: false },
      relations: ["anonymousUser"],
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.anonymousUser.id !== user.id) {
      throw new ForbiddenException("You can only edit your own comments");
    }

    const ageMs = Date.now() - comment.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      throw new BadRequestException(
        "Comments can only be edited within 5 minutes of posting",
      );
    }

    const mentionedUsernames = this.parseMentions(newContent);

    await this.commentRepo.update(id, {
      content: newContent,
      editedAt: new Date(),
      mentionedUsernames:
        mentionedUsernames.length > 0 ? mentionedUsernames : undefined,
    });

    return this.commentRepo.findOne({
      where: { id },
      relations: ["anonymousUser", "replies"],
    }) as Promise<Comment>;
  }

  // ---------------------------------------------------------------------------
  // Delete comment (soft delete — shows [deleted] placeholder)
  // ---------------------------------------------------------------------------

  async delete(id: number, user: AnonymousUser): Promise<void> {
    const comment = await this.commentRepo.findOne({
      where: { id, isDeleted: false },
      relations: ["anonymousUser"],
    });

    if (!comment) {
      throw new NotFoundException("Comment not found");
    }
    if (comment.anonymousUser.id !== user.id) {
      throw new BadRequestException("You can only delete your own comments");
    }

    // Soft delete: replace content with placeholder so replies stay attached.
    await this.commentRepo.update(id, {
      isDeleted: true,
      content: "[deleted]",
    });

    this.analyticsService
      .invalidateTrendingCache("comment-deleted")
      .catch((err) =>
        this.logger.error(
          "Failed to invalidate trending cache after comment delete",
          err,
        ),
      );
  }

  // ---------------------------------------------------------------------------
  // Find comments (threaded)
  // ---------------------------------------------------------------------------

  async findByConfessionId(
    confessionId: string,
    queryDto: GetCommentsQueryDto,
  ): Promise<CursorPaginatedResponseDto<Comment>> {
    const { cursor, sortField, sortOrder, limit, page, includeOrphanedReplies } =
      queryDto;

    const parsedCursor = this.parseCursor(cursor);
    const { orderBy, orderDirection, whereCondition } = this.buildOrdering(
      sortField!,
      sortOrder!,
      parsedCursor,
    );

    const actualLimit = limit!;
    const fetchLimit = actualLimit + 1;

    const qb = this.commentRepo
      .createQueryBuilder("comment")
      .leftJoinAndSelect("comment.confession", "confession")
      .leftJoinAndSelect("comment.anonymousUser", "anonymousUser")
      .leftJoinAndSelect("comment.parent", "parent")
      .leftJoinAndSelect("comment.replies", "replies")
      .innerJoin(
        "moderation_comments",
        "moderation",
        "moderation.commentId = comment.id",
      )
      .where("comment.confession = :confessionId AND confession.isDeleted = false", {
        confessionId,
      })
      .andWhere("moderation.status = :status", {
        status: ModerationStatus.APPROVED,
      });

    if (parsedCursor && whereCondition) {
      qb.andWhere(whereCondition, {
        cursorDate: parsedCursor.createdAt,
        cursorId: parsedCursor.id,
      });
    }

    if (!includeOrphanedReplies) {
      qb.andWhere(
        "(comment.parent IS NULL OR comment.parent.isDeleted = false)",
      );
    }

    if (!cursor && page && page > 1) {
      qb.andWhere("comment.parent IS NULL");
      qb.skip((page - 1) * actualLimit);
    } else if (!cursor) {
      qb.andWhere("comment.parent IS NULL");
    }

    qb.orderBy(orderBy, orderDirection).take(fetchLimit);

    const comments = await qb.getMany();
    const hasMore = comments.length > actualLimit;
    const resultComments = hasMore ? comments.slice(0, actualLimit) : comments;

    let nextCursor: string | null = null;
    if (hasMore && resultComments.length > 0) {
      nextCursor = this.createCursor(
        resultComments[resultComments.length - 1],
      );
    }

    return new CursorPaginatedResponseDto(
      resultComments,
      nextCursor,
      hasMore,
      actualLimit,
    );
  }

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

  // ---------------------------------------------------------------------------
  // Moderation
  // ---------------------------------------------------------------------------

  async moderateComment(
    commentId: number,
    status: ModerationStatus,
    moderator: User,
  ): Promise<{ success: boolean; message: string }> {
    const moderation = await this.moderationCommentRepo.findOne({
      where: { comment: { id: commentId } },
      relations: ["comment"],
    });
    if (!moderation) {
      throw new NotFoundException("Moderation entry not found for comment");
    }
    if (moderation.status !== ModerationStatus.PENDING) {
      throw new BadRequestException("Comment has already been moderated");
    }
    moderation.status = status;
    moderation.moderatedAt = new Date();
    moderation.moderatedBy = moderator;
    moderation.moderatedById = moderator.id;
    await this.moderationCommentRepo.save(moderation);

    this.analyticsService
      .invalidateTrendingCache(`comment-moderated:${status}`)
      .catch((err) =>
        this.logger.error(
          "Failed to invalidate trending cache after moderation",
          err,
        ),
      );
    this.analyticsService
      .invalidateStatsCache(`comment-moderated:${status}`)
      .catch((err) =>
        this.logger.error(
          "Failed to invalidate stats cache after moderation",
          err,
        ),
      );

    return { success: true, message: `Comment ${status}` };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getRecipientEmail(anonymousUser: AnonymousUser): string | null {
    if (!anonymousUser) return null;
    const link = anonymousUser.userLinks?.[0];
    if (link?.user) {
      return link.user.getEmail();
    }
    return null;
  }

  private parseCursor(cursor?: string): CommentCursor | undefined {
    return decodeCursor<CommentCursor>(cursor);
  }

  private createCursor(comment: Comment): string {
    return encodeCursor({
      id: comment.id,
      createdAt: comment.createdAt.toISOString(),
    });
  }

  private buildOrdering(
    sortField: CommentSortField,
    sortOrder: SortOrder,
    cursor?: CommentCursor,
  ): {
    orderBy: string;
    orderDirection: "ASC" | "DESC";
    whereCondition: string;
  } {
    const orderDirection = sortOrder === SortOrder.ASC ? "ASC" : "DESC";

    switch (sortField) {
      case CommentSortField.CREATED_AT:
        if (cursor) {
          const operator = sortOrder === SortOrder.ASC ? ">" : "<";
          const tieBreakOperator = sortOrder === SortOrder.ASC ? ">=" : "<=";
          return {
            orderBy: "comment.createdAt, comment.id",
            orderDirection,
            whereCondition: `(comment.createdAt ${operator} :cursorDate OR (comment.createdAt = :cursorDate AND comment.id ${tieBreakOperator} :cursorId))`,
          };
        }
        return {
          orderBy: "comment.createdAt, comment.id",
          orderDirection,
          whereCondition: "",
        };

      case CommentSortField.ID:
        if (cursor) {
          const operator = sortOrder === SortOrder.ASC ? ">" : "<";
          return {
            orderBy: "comment.id",
            orderDirection,
            whereCondition: `comment.id ${operator} :cursorId`,
          };
        }
        return { orderBy: "comment.id", orderDirection, whereCondition: "" };

      default:
        throw new BadRequestException("Unsupported sort field");
    }
  }
}
