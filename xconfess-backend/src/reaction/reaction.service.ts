import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryFailedError } from 'typeorm';
import { CreateReactionDto } from './dto/create-reaction.dto';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { Reaction } from './entities/reaction.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { assertCanUseAnonymousIdentity } from '../common/security/anonymous-identity-ownership';
import {
  OutboxEvent,
  OutboxStatus,
} from '../common/entities/outbox-event.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { ReactionsGateway } from './reactions.gateway';

@Injectable()
export class ReactionService {
  private readonly logger = new Logger(ReactionService.name);

  constructor(
    @InjectRepository(Reaction)
    private reactionRepo: Repository<Reaction>,
    @InjectRepository(AnonymousConfession)
    private confessionRepo: Repository<AnonymousConfession>,
    @InjectRepository(AnonymousUser)
    private anonymousUserRepo: Repository<AnonymousUser>,
    @InjectRepository(OutboxEvent)
    private outboxRepo: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
    private readonly analyticsService: AnalyticsService,
    private readonly reactionsGateway: ReactionsGateway,
  ) {}

  async createReaction(
    dto: CreateReactionDto,
    actorUserId?: number | string | null,
  ): Promise<Reaction> {
    if (!dto.anonymousUserId) {
      throw new BadRequestException('Anonymous user id is required');
    }

    const anonymousUserId = dto.anonymousUserId;

    // 1. Verify confession exists and is not soft-deleted.
    const confession = await this.confessionRepo.findOne({
      where: { id: dto.confessionId, isDeleted: false },
      relations: [
        'anonymousUser',
        'anonymousUser.userLinks',
        'anonymousUser.userLinks.user',
      ],
    });

    if (!confession) {
      throw new NotFoundException('Confession not found');
    }

    // 1.5: Check privacy settings - prevent reactions if author disabled them
    const authorUser = confession.anonymousUser?.userLinks?.[0]?.user;
    if (authorUser && !authorUser.shouldShowReactions()) {
      throw new ForbiddenException('Reactions are disabled for this user');
    }

    // 2. Verify the reacting anonymous user exists.
    const anonymousUser = await this.anonymousUserRepo.findOne({
      where: { id: anonymousUserId },
      relations: ['userLinks'],
    });

    assertCanUseAnonymousIdentity(anonymousUser, { userId: actorUserId });

    return this.dataSource
      .transaction(async (manager) => {
        const reactionRepo = manager.getRepository(Reaction);
        const outboxRepo = manager.getRepository(OutboxEvent);

        // 3. Prevent duplicate reactions
        const existing = await reactionRepo.findOne({
          where: {
            confession: { id: dto.confessionId },
            anonymousUser: { id: anonymousUserId },
          },
        });

        if (existing) {
          if (existing.emoji === dto.emoji) {
            return { reaction: existing, isNew: false, isUpdate: false };
          }

          existing.emoji = dto.emoji;
          const updated = await reactionRepo.save(existing);

          await this.createOutboxEvent(
            outboxRepo,
            confession,
            updated,
            'reaction_update',
          );

          return { reaction: updated, isNew: false, isUpdate: true };
        }

        // 4. Persist new reaction
        const reaction = reactionRepo.create({
          emoji: dto.emoji,
          confession,
          anonymousUser,
        });

        try {
          const savedReaction = await reactionRepo.save(reaction);

          await this.createOutboxEvent(
            outboxRepo,
            confession,
            savedReaction,
            'reaction_notification',
          );

          return { reaction: savedReaction, isNew: true, isUpdate: false };
        } catch (err) {
          // Handle race condition: a concurrent request may have inserted the
          // same reaction between our findOne and save. The DB unique
          // constraint on (confession_id, anonymous_user_id) will reject the
          // duplicate insert. In that case, re-fetch the existing row so the
          // caller receives a stable idempotent response.
          if (
            err instanceof QueryFailedError &&
            this.isUniqueViolation(err)
          ) {
            this.logger.debug(
              `Race-condition duplicate detected for reaction ` +
                `(confession=${dto.confessionId}, user=${anonymousUserId})`,
            );
            const raceExisting = await reactionRepo.findOne({
              where: {
                confession: { id: dto.confessionId },
                anonymousUser: { id: anonymousUserId },
              },
            });

            if (raceExisting) {
              return { reaction: raceExisting, isNew: false, isUpdate: false };
            }
          }
          throw err;
        }
      })
      .then(async (result) => {
        // Invalidate analytics segments that are affected by a reaction change.
        // Done outside the DB transaction so cache churn does not increase
        // transaction latency. Errors are absorbed by the cache service.
        this.analyticsService
          .invalidateTrendingCache('reaction-mutation')
          .catch((err) =>
            this.logger.error(
              'Failed to invalidate trending cache after reaction',
              err,
            ),
          );
        this.analyticsService
          .invalidateReactionDistributionCache('reaction-mutation')
          .catch((err) =>
            this.logger.error(
              'Failed to invalidate reaction distribution cache',
              err,
            ),
          );

        // 5. Broadcast canonical WebSocket event for new reactions only.
        // Duplicate / idempotent requests must not emit extra events.
        if (result.isNew) {
          this.reactionsGateway.broadcastReactionAdded(confession.id, {
            reactionId: result.reaction.id,
            userId: anonymousUserId,
            reactionType: result.reaction.emoji,
            timestamp: result.reaction.createdAt,
            totalCount: await this.getReactionCount(confession.id),
          });
        }

        return result.reaction;
      });
  }

  /**
   * Returns the total reaction count for a confession.
   * Used after persisting a new reaction to include an accurate count in the
   * WebSocket broadcast payload.
   */
  private async getReactionCount(confessionId: string): Promise<number> {
    return this.reactionRepo.count({
      where: { confession: { id: confessionId } },
    });
  }

  /**
   * Detects whether a TypeORM QueryFailedError wraps a Postgres unique
   * constraint violation (SQLSTATE 23505).
   */
  private isUniqueViolation(err: QueryFailedError): boolean {
    const driverError = err.driverError as { code?: string };
    return driverError?.code === '23505';
  }

  private async createOutboxEvent(
    outboxRepo: Repository<OutboxEvent>,
    confession: AnonymousConfession,
    reaction: Reaction,
    type: string,
  ) {
    const recipientEmail = this.getRecipientEmail(confession.anonymousUser);
    if (recipientEmail) {
      await outboxRepo.save(
        outboxRepo.create({
          type,
          payload: {
            reactionId: reaction.id,
            confessionId: confession.id,
            recipientEmail,
            emoji: reaction.emoji,
          },
          // Idempotency key for reactions can be user-confession-emoji if we want to limit alerts
          idempotencyKey: `${type}:${reaction.id}:${reaction.emoji}`,
          status: OutboxStatus.PENDING,
        }),
      );
    }
  }

  private getRecipientEmail(anonymousUser: AnonymousUser): string | null {
    if (!anonymousUser) return null;
    const link = anonymousUser.userLinks?.[0];
    if (link?.user) {
      return link.user.getEmail() ?? null;
    }
    return null;
  }
}
