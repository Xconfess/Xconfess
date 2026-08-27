import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { Reaction } from '../reaction/entities/reaction.entity';
import { Comment } from '../comment/entities/comment.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';

export interface AnomalyScore {
  userId: string | null;
  confessionId: string;
  velocityScore: number;
  clusterScore: number;
  accountAgeScore: number;
  overallBotScore: number;
  flags: string[];
}

export interface AnomalyDetectionConfig {
  maxReactionsPerMinute: number;
  maxCommentsPerMinute: number;
  maxReactionsFromSingleUser: number;
  clusterTimeWindowMinutes: number;
  clusterMinimumCount: number;
  minAccountAgeHours: number;
  lowAccountAgePenalty: number;
  reactionVelocityWeight: number;
  clusterWeight: number;
  accountAgeWeight: number;
}

const DEFAULT_CONFIG: AnomalyDetectionConfig = {
  maxReactionsPerMinute: 30,
  maxCommentsPerMinute: 10,
  maxReactionsFromSingleUser: 50,
  clusterTimeWindowMinutes: 5,
  clusterMinimumCount: 5,
  minAccountAgeHours: 1,
  lowAccountAgePenalty: 0.5,
  reactionVelocityWeight: 0.4,
  clusterWeight: 0.35,
  accountAgeWeight: 0.25,
};

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private config: AnomalyDetectionConfig = DEFAULT_CONFIG;

  constructor(
    @InjectRepository(Reaction)
    private reactionRepository: Repository<Reaction>,
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    @InjectRepository(AnonymousUser)
    private anonymousUserRepository: Repository<AnonymousUser>,
  ) {}

  updateConfig(partial: Partial<AnomalyDetectionConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  async assessConfession(confessionId: string): Promise<AnomalyScore> {
    const now = new Date();

    const velocityScore = await this.computeVelocityScore(confessionId, now);
    const clusterScore = await this.computeClusterScore(confessionId, now);
    const accountAgeScore = await this.computeAccountAgeScore(confessionId);

    const flags: string[] = [];
    if (velocityScore > 0.7) flags.push('high_reaction_velocity');
    if (clusterScore > 0.7) flags.push('coordinated_reaction_cluster');
    if (accountAgeScore > 0.5) flags.push('low_account_age');

    const overallBotScore =
      velocityScore * this.config.reactionVelocityWeight +
      clusterScore * this.config.clusterWeight +
      accountAgeScore * this.config.accountAgeWeight;

    return {
      userId: null,
      confessionId,
      velocityScore,
      clusterScore,
      accountAgeScore,
      overallBotScore: Math.min(1, overallBotScore),
      flags,
    };
  }

  private async computeVelocityScore(
    confessionId: string,
    now: Date,
  ): Promise<number> {
    const oneMinuteAgo = new Date(now.getTime() - 60000);

    try {
      const [recentReactions, recentComments] = await Promise.all([
        this.reactionRepository.count({
          where: {
            confession: { id: confessionId },
            createdAt: MoreThan(oneMinuteAgo),
          },
        }),
        this.commentRepository.count({
          where: {
            confession: { id: confessionId },
            createdAt: MoreThan(oneMinuteAgo),
          },
        }),
      ]);

      const reactionRatio = recentReactions / this.config.maxReactionsPerMinute;
      const commentRatio = recentComments / this.config.maxCommentsPerMinute;
      const combinedScore = Math.max(reactionRatio, commentRatio);

      return Math.min(1, combinedScore);
    } catch {
      return 0;
    }
  }

  private async computeClusterScore(
    confessionId: string,
    now: Date,
  ): Promise<number> {
    const windowStart = new Date(
      now.getTime() - this.config.clusterTimeWindowMinutes * 60000,
    );

    try {
      const recentReactions = await this.reactionRepository.find({
        where: {
          confession: { id: confessionId },
          createdAt: MoreThan(windowStart),
        },
        relations: ['anonymousUser'],
      });

      if (recentReactions.length < this.config.clusterMinimumCount) {
        return 0;
      }

      const userReactionCounts = new Map<string, number>();
      for (const reaction of recentReactions) {
        const uid = reaction.anonymousUser?.id || 'unknown';
        userReactionCounts.set(uid, (userReactionCounts.get(uid) || 0) + 1);
      }

      const maxFromSingleUser = Math.max(...userReactionCounts.values());
      const clusterRatio =
        maxFromSingleUser / this.config.maxReactionsFromSingleUser;

      const uniqueUsers = userReactionCounts.size;
      const concentrationRatio = recentReactions.length / Math.max(1, uniqueUsers);
      const concentrationScore = Math.min(
        1,
        concentrationRatio / this.config.clusterMinimumCount,
      );

      return Math.min(1, Math.max(clusterRatio, concentrationScore));
    } catch {
      return 0;
    }
  }

  private async computeAccountAgeScore(confessionId: string): Promise<number> {
    try {
      const recentReactors = await this.reactionRepository.find({
        where: { confession: { id: confessionId } },
        relations: ['anonymousUser'],
        take: 20,
      });

      if (recentReactors.length === 0) return 0;

      const now = new Date();
      const minAgeMs = this.config.minAccountAgeHours * 3600000;
      let youngAccountCount = 0;

      const seen = new Set<string>();
      for (const reaction of recentReactors) {
        const uid = reaction.anonymousUser?.id;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);

        const user = await this.anonymousUserRepository.findOne({
          where: { id: uid },
        });
        if (user) {
          const ageMs = now.getTime() - user.createdAt.getTime();
          if (ageMs < minAgeMs) {
            youngAccountCount++;
          }
        }
      }

      const ratio = seen.size > 0 ? youngAccountCount / seen.size : 0;
      return Math.min(1, ratio);
    } catch {
      return 0;
    }
  }

  async getAdjustmentFactor(confessionId: string): Promise<number> {
    const score = await this.assessConfession(confessionId);
    if (score.overallBotScore > 0.8) return 0;
    if (score.overallBotScore > 0.6) return 0.25;
    if (score.overallBotScore > 0.4) return 0.5;
    if (score.overallBotScore > 0.2) return 0.75;
    return 1.0;
  }
}
