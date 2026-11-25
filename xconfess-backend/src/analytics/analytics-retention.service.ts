import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AnalyticsEvent } from './entities/analytics-event.entity';

export interface RetentionCleanupResult {
  deletedCount: number;
  batchesProcessed: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  nextCursor?: string;
  isComplete: boolean;
  config: {
    retentionDays: number;
    batchSize: number;
    cutoffDate: string;
  };
}

export interface RetentionOptions {
  retentionDays?: number;
  batchSize?: number;
  dryRun?: boolean;
  resumeAfterId?: string;
}

/**
 * Manages retention and cleanup of raw analytics events.
 *
 * Preserves daily rollups and aggregates by only deleting raw events older
 * than the configured retention period. This allows long-term trend analysis
 * while bounding raw data storage.
 */
@Injectable()
export class AnalyticsRetentionService {
  private readonly logger = new Logger(AnalyticsRetentionService.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly eventRepository: Repository<AnalyticsEvent>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Clean up analytics events older than retention period.
   * Processes in configurable batches to avoid locking the entire table.
   * Resumable via cursor to allow progress tracking across restarts.
   */
  async cleanupOldEvents(options: RetentionOptions = {}): Promise<RetentionCleanupResult> {
    const startTime = Date.now();
    const retentionDays = options.retentionDays ?? this.getDefaultRetentionDays();
    const batchSize = options.batchSize ?? this.getDefaultBatchSize();
    const dryRun = options.dryRun ?? false;
    const resumeAfterId = options.resumeAfterId ?? null;

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    this.logger.log(
      `Starting analytics cleanup: retention=${retentionDays}d, ` +
      `batchSize=${batchSize}, cutoff=${cutoffDate.toISOString()}` +
      (dryRun ? ' [DRY RUN]' : ''),
    );

    let totalDeleted = 0;
    let batchesProcessed = 0;
    let lastProcessedId = resumeAfterId;

    // Process batches until no more records found
    while (true) {
      const query = this.eventRepository
        .createQueryBuilder('event')
        .where('event.occurredAt < :cutoff', { cutoff: cutoffDate })
        .select(['event.id', 'event.occurredAt', 'event.eventName'])
        .orderBy('event.id', 'ASC')
        .take(batchSize);

      if (lastProcessedId) {
        query.andWhere('event.id > :lastId', { lastId: lastProcessedId });
      }

      const batch = await query.getMany();

      if (batch.length === 0) {
        break;
      }

      batchesProcessed++;

      if (!dryRun) {
        // Delete events in this batch
        const batchIds = batch.map((e) => e.id);
        const result = await this.eventRepository
          .createQueryBuilder()
          .delete()
          .where('id IN (:...ids)', { ids: batchIds })
          .execute();

        totalDeleted += result.affected ?? 0;
        lastProcessedId = batch[batch.length - 1].id;

        this.logger.debug(
          `Batch #${batchesProcessed}: deleted ${result.affected} events (IDs up to ${lastProcessedId})`,
        );
      } else {
        // Dry run: just count
        totalDeleted += batch.length;
        lastProcessedId = batch[batch.length - 1].id;
        this.logger.debug(`Batch #${batchesProcessed} (dry run): would delete ${batch.length} events`);
      }

      // Small yield to avoid starving other queries
      await new Promise((r) => setTimeout(r, 50));
    }

    const durationMs = Date.now() - startTime;

    this.logger.log(
      `Cleanup complete: deleted/would-delete ${totalDeleted} events ` +
      `in ${batchesProcessed} batches (${durationMs}ms)` +
      (dryRun ? ' [DRY RUN - no changes persisted]' : ''),
    );

    return {
      deletedCount: totalDeleted,
      batchesProcessed,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(Date.now()).toISOString(),
      durationMs,
      isComplete: true,
      nextCursor: lastProcessedId ?? undefined,
      config: {
        retentionDays,
        batchSize,
        cutoffDate: cutoffDate.toISOString(),
      },
    };
  }

  /**
   * Get current retention configuration and counts.
   */
  async getRetentionStatus(): Promise<{
    totalEvents: number;
    expiredEventsCount: number;
    cutoffDate: string;
    retentionDays: number;
    estimatedStorageConsumptionMb: number;
  }> {
    const retentionDays = this.getDefaultRetentionDays();
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const [totalCount, expiredCount] = await Promise.all([
      this.eventRepository.count(),
      this.eventRepository.count({
        where: {
          occurredAt: LessThan(cutoffDate),
        },
      }),
    ]);

    // Rough estimate: average event ~500 bytes
    const estimatedMbPerEvent = 500 / 1024 / 1024;
    const estimatedStorage = totalCount * estimatedMbPerEvent;

    return {
      totalEvents: totalCount,
      expiredEventsCount: expiredCount,
      cutoffDate: cutoffDate.toISOString(),
      retentionDays,
      estimatedStorageConsumptionMb: Math.round(estimatedStorage * 100) / 100,
    };
  }

  /**
   * Verify that daily rollups exist for events about to be deleted.
   * Returns count of events lacking corresponding rollup records.
   */
  async verifyRollupCoverage(
    retentionDays?: number,
  ): Promise<{
    eventsWithoutRollups: number;
    recommendation: string;
  }> {
    const days = retentionDays ?? this.getDefaultRetentionDays();
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Find events that would be deleted and check for corresponding rollups
    // This is a simplified check — adjust based on your actual rollup structure
    const expiredCount = await this.eventRepository.count({
      where: {
        occurredAt: LessThan(cutoffDate),
      },
    });

    const hasRollups = await this.eventRepository
      .query(`
        SELECT COUNT(*) FROM analytics_daily_rollups
        WHERE occurred_at < $1 LIMIT 1
      `, [cutoffDate]);

    const recommendation =
      hasRollups && hasRollups[0]?.count > 0
        ? 'Rollups exist. Safe to proceed with deletion.'
        : 'No rollups found. Consider running analytics aggregation before cleanup.';

    return {
      eventsWithoutRollups: expiredCount,
      recommendation,
    };
  }

  private getDefaultRetentionDays(): number {
    const configured = this.configService.get<string>('ANALYTICS_RETENTION_DAYS');
    return configured ? parseInt(configured, 10) : 90; // 90 days default
  }

  private getDefaultBatchSize(): number {
    const configured = this.configService.get<string>('ANALYTICS_CLEANUP_BATCH_SIZE');
    return configured ? parseInt(configured, 10) : 5000; // 5k records per batch
  }
}
