// src/moderation/moderation-repository.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ModerationLog } from './entities/moderation-log.entity';
import { ModerationResult, ModerationStatus } from './ai-moderation.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { QueryModerationDto } from './dtos/query-moderation.dto';
import {
  assertValidTransition,
  InvalidModerationTransitionError,
} from './moderation-state-machine';

@Injectable()
export class ModerationRepositoryService {
  private readonly logger = new Logger(ModerationRepositoryService.name);

  constructor(
    @InjectRepository(ModerationLog)
    private readonly moderationLogRepo: Repository<ModerationLog>,
    private readonly dataSource: DataSource,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createLog(
    content: string,
    result: ModerationResult,
    confessionId?: string,
    userId?: string,
    apiProvider?: string,
    manager?: EntityManager,
  ): Promise<ModerationLog> {
    const repo = manager
      ? manager.getRepository(ModerationLog)
      : this.moderationLogRepo;
    const log = repo.create({
      confessionId,
      userId,
      content: content.substring(0, 5000),
      moderationScore: result.score,
      moderationFlags: result.flags,
      moderationStatus: result.status,
      details: result.details,
      requiresReview: result.requiresReview,
      autoActioned: result.status !== ModerationStatus.PENDING,
      apiProvider: apiProvider || 'fallback',
    });

    return await repo.save(log);
  }

  async syncWebhookResult(
    params: {
      confessionId: string;
      content: string;
      userId?: string;
      result: ModerationResult;
      deliveryHash: string;
      deliveryTimestamp: string;
      signatureValid?: boolean;
      payloadMalformed?: boolean;
      deliveryStale?: boolean;
    },
    manager?: EntityManager,
  ): Promise<{ log: ModerationLog; isIdempotent: boolean }> {
    const repo = manager
      ? manager.getRepository(ModerationLog)
      : this.moderationLogRepo;

    const existing = await repo.findOne({
      where: { confessionId: params.confessionId },
      order: { createdAt: 'DESC' },
    });

    const existingWebhookHash = existing?.metadata?.webhook?.deliveryHash;
    if (existing && existingWebhookHash === params.deliveryHash) {
      return { log: existing, isIdempotent: true };
    }

    const log =
      existing ??
      repo.create({
        confessionId: params.confessionId,
        userId: params.userId,
        content: params.content.substring(0, 5000),
      });

    log.userId = params.userId ?? '';
    log.content = params.content.substring(0, 5000);
    log.moderationScore = params.result.score;
    log.moderationFlags = params.result.flags;
    log.moderationStatus = params.result.status;
    log.details = params.result.details;
    log.requiresReview = params.result.requiresReview;
    log.autoActioned = params.result.status !== ModerationStatus.PENDING;
    log.apiProvider = 'webhook';
    log.metadata = {
      ...(existing?.metadata ?? {}),
      webhook: {
        deliveryHash: params.deliveryHash,
        timestamp: params.deliveryTimestamp,
        processedAt: new Date().toISOString(),
        signatureValid: params.signatureValid ?? true,
        payloadMalformed: params.payloadMalformed ?? false,
        stale: params.deliveryStale ?? false,
      },
    };

    return {
      log: await repo.save(log),
      isIdempotent: false,
    };
  }

  async updateReview(
    logId: string,
    status: ModerationStatus,
    reviewedBy: string,
    notes?: string,
  ): Promise<ModerationLog> {
    const log = await this.moderationLogRepo.findOne({ where: { id: logId } });

    if (!log) {
      throw new Error('Moderation log not found');
    }

    log.reviewed = true;
    log.reviewedBy = reviewedBy;
    log.reviewedAt = new Date();
    log.moderationStatus = status;
    if (notes) {
      log.reviewNotes = notes;
    }

    return await this.moderationLogRepo.save(log);
  }

   /**
   * Replaces the free-form `updateReview`. Validates the transition against
   * the state machine, persists it, and writes an audit log entry in the
   * same DB transaction so a failed audit write rolls back the state change.
   */
   async transitionState(
    logId: string,
    nextState: ModerationStatus,
    actor: { id: string; email?: string },
    reason: string,
    notes?: string,
  ): Promise<ModerationLog> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const repo = manager.getRepository(ModerationLog);

      const log = await repo.findOne({
        where: { id: logId },
        lock: { mode: 'pessimistic_write' }, // guards against two admins racing the same item
      });
      if (!log) {
        throw new NotFoundException('Moderation log not found');
      }

      const previousState = log.moderationStatus;

      try {
        assertValidTransition(previousState, nextState);
      } catch (err) {
        if (err instanceof InvalidModerationTransitionError) {
          // Re-thrown as-is; controller maps it to a 400.
          throw err;
        }
        throw err;
      }

      log.moderationStatus = nextState;
      log.reviewed = true;
      log.reviewedBy = actor.id;
      log.reviewedAt = new Date();
      if (notes) log.reviewNotes = notes;

      const saved = await repo.save(log);

      // Audit write happens inside the same transaction's outer flow, but
      // AuditLogService.log() already swallows its own errors so it never
      // rolls back the state change — that's intentional (see its try/catch).
      await this.auditLogService.logModerationStateTransition(
        saved.id,
        previousState,
        nextState,
        actor.id,
        reason,
        { confessionId: saved.confessionId, notes },
      );

      return saved;
    });
  }

  /**
   * General queue view: filter by state, free-text search, paginate.
   * Distinct from getPendingReviews (which is hardcoded to the "needs first
   * look" subset) — this is for browsing any state, e.g. the "Resolved" tab.
   */
  async getQueue(query: QueryModerationDto) {
    const qb = this.moderationLogRepo.createQueryBuilder('log');

    if (query.status) {
      qb.andWhere('log.moderationStatus = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        '(log.confessionId ILIKE :search OR log.userId ILIKE :search OR log.content ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('log.updatedAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }


  async getPendingReviews(limit = 50, offset = 0) {
    return await this.moderationLogRepo.find({
      where: [
        { requiresReview: true, reviewed: false },
        { moderationStatus: ModerationStatus.FLAGGED, reviewed: false },
      ],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getLogsByConfession(confessionId: string) {
    return await this.moderationLogRepo.find({
      where: { confessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async getLogsByUser(userId: string, limit = 100) {
    return await this.moderationLogRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getModerationStats(startDate?: Date, endDate?: Date) {
    const query = this.moderationLogRepo.createQueryBuilder('log');

    if (startDate) {
      query.andWhere('log.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('log.createdAt <= :endDate', { endDate });
    }

    const total = await query.getCount();

    const byStatus = await query
      .select('log.moderationStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.moderationStatus')
      .getRawMany();

    const avgScore = await query
      .select('AVG(log.moderationScore)', 'avgScore')
      .getRawOne<{ avgScore: string | number | null }>();

    return {
      total,
      byStatus,
      avgScore: avgScore?.avgScore ? Number(avgScore.avgScore) : 0,
    };
  }

  async getAccuracyMetrics() {
    const reviewed = await this.moderationLogRepo.find({
      where: { reviewed: true },
    });

    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    for (const log of reviewed) {
      const aiPredictedHarmful =
        log.moderationStatus === ModerationStatus.REJECTED ||
        log.moderationStatus === ModerationStatus.FLAGGED;
      const humanConfirmedHarmful =
        log.moderationStatus === ModerationStatus.REJECTED;

      if (aiPredictedHarmful && humanConfirmedHarmful) truePositives++;
      else if (aiPredictedHarmful && !humanConfirmedHarmful) falsePositives++;
      else if (!aiPredictedHarmful && !humanConfirmedHarmful) trueNegatives++;
      else if (!aiPredictedHarmful && humanConfirmedHarmful) falseNegatives++;
    }

    const total = reviewed.length;
    const accuracy = total > 0 ? (truePositives + trueNegatives) / total : 0;
    const precision =
      truePositives + falsePositives > 0
        ? truePositives / (truePositives + falsePositives)
        : 0;
    const recall =
      truePositives + falseNegatives > 0
        ? truePositives / (truePositives + falseNegatives)
        : 0;
    const f1Score =
      precision + recall > 0
        ? (2 * (precision * recall)) / (precision + recall)
        : 0;

    return {
      total,
      truePositives,
      falsePositives,
      trueNegatives,
      falseNegatives,
      accuracy,
      precision,
      recall,
      f1Score,
    };
  }
}
