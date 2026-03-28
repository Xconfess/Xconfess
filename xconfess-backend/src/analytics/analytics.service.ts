// src/analytics/analytics.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reaction } from 'src/reaction/entities/reaction.entity';
import { User } from 'src/user/entities/user.entity';
import { AnonymousConfession } from 'src/confession/entities/confession.entity';
import { CacheService } from 'src/cache/cache.service';
import {
  AnalyticsCacheKeys,
  InvalidationPrefixes,
} from 'src/cache/cache-namespace';
import { toWindowBoundaries } from 'src/types/analytics.types';

type TrendDirection = 'increasing' | 'decreasing' | 'stable';

interface AnalyticsWindowRange {
  startAt: Date;
  endAt: Date;
}

/** Exported for controller / declaration emit (TS4053). */
export interface ComparisonWindowMetadata {
  requestedDays: number;
  bucketUnit: 'day';
  bucketCount: number;
  current: {
    startAt: string;
    endAt: string;
  };
  previous: {
    startAt: string;
    endAt: string;
  };
}

export interface DailyGrowthPoint {
  date: string;
  count: number;
}

export interface GrowthMetrics {
  period: string;
  totalConfessions: number;
  averagePerDay: number;
  dailyGrowth: DailyGrowthPoint[];
  trend: TrendDirection;
}

interface BucketCountRow extends Record<string, string | number> {
  date: string;
  count: string | number;
}

export interface DailyActivityPoint {
  date: string;
  activeUsers: number;
}

export interface UserActivityMetrics {
  period: string;
  dailyActivity: DailyActivityPoint[];
  averageDAU: number;
}

export interface ReactionDistributionMetrics {
  total: number;
  distribution: Array<{
    type: string;
    count: number;
    percentage: string;
  }>;
  period: string;
}

interface TrendingConfessionWithReactionCount extends AnonymousConfession {
  reactionCount?: number;
}

interface CategoryStatsRow {
  category: string | null;
  count: string;
}

interface ReactionDistributionRow {
  type: string;
  count: string;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly CACHE_TTL = 900; // 15 minutes in seconds

  constructor(
    @InjectRepository(AnonymousConfession)
    private confessionRepository: Repository<AnonymousConfession>,
    @InjectRepository(Reaction)
    private reactionRepository: Repository<Reaction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly cacheService: CacheService,
  ) {}

  async getTrendingConfessions(days: number = 7) {
    // Use namespace-compliant cache key
    const cacheKey = AnalyticsCacheKeys.trending(days);

    // Try to get from cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Use UTC-normalized window boundaries so edge timestamps are never
    // ambiguously shifted between buckets regardless of server timezone.
    const { startAt, endAt } = toWindowBoundaries(days);

    const trending = await this.confessionRepository
      .createQueryBuilder('confession')
      .leftJoinAndSelect('confession.reactions', 'reaction')
      .where('confession.createdAt >= :startAt', { startAt })
      .andWhere('confession.createdAt < :endAt', { endAt })
      .andWhere('confession.isPublished = :isPublished', { isPublished: true })
      .loadRelationCountAndMap(
        'confession.reactionCount',
        'confession.reactions',
      )
      .orderBy('confession.reactionCount', 'DESC')
      .take(20)
      .getMany();

    const result = trending.map((confession) => {
      const confessionWithCounts =
        confession as TrendingConfessionWithReactionCount;

      return {
        id: confession.id,
        content: confession.content.substring(0, 200), // Preview only
        reactionCount: confessionWithCounts.reactionCount || 0,
        createdAt: confession.created_at,
        category: confession.comments,
      };
    });

    // Cache the result
    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  async getReactionDistribution(days: number = 7) {
    // Use namespace-compliant cache key
    const cacheKey = AnalyticsCacheKeys.reactions(days);

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.getReactionDistributionForWindow(
      this.getCurrentWindow(days),
      days,
    );

    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  async getDailyActiveUsers(days: number = 7) {
    // Use namespace-compliant cache key
    const cacheKey = AnalyticsCacheKeys.users(days);

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.getUserActivityForWindow(
      this.getCurrentWindow(days),
      days,
    );

    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  async getPlatformStats() {
    // Use namespace-compliant cache key
    const cacheKey = AnalyticsCacheKeys.stats();

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [totalUsers, totalConfessions, totalReactions, publishedConfessions] =
      await Promise.all([
        this.userRepository.count(),
        this.confessionRepository.count(),
        this.reactionRepository.count(),
        // Note: isPublished field doesn't exist, using total count instead
        this.confessionRepository.count({ where: { isDeleted: false } }),
      ]);

    // Get most popular category
    const categoryStats = (await this.confessionRepository
      .createQueryBuilder('confession')
      .select('confession.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('confession.isPublished = :isPublished', { isPublished: true })
      .groupBy('confession.category')
      .orderBy('count', 'DESC')
      .limit(1)
      .getRawOne()) as CategoryStatsRow | null;

    const result = {
      totalUsers,
      totalConfessions,
      totalReactions,
      publishedConfessions,
      pendingConfessions: totalConfessions - publishedConfessions,
      averageReactionsPerConfession:
        publishedConfessions > 0
          ? (totalReactions / publishedConfessions).toFixed(2)
          : 0,
      mostPopularCategory: categoryStats?.category || 'N/A',
      lastUpdated: new Date(),
    };

    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  async getConfessionGrowth(days: number = 7) {
    // Use namespace-compliant cache key
    const cacheKey = AnalyticsCacheKeys.growth(days);

    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.getGrowthMetricsForWindow(
      this.getCurrentWindow(days),
      days,
    );

    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  async getConfessionGrowthComparison(days: number = 7) {
    const comparison = this.getComparisonWindows(days);
    const [current, previous] = await Promise.all([
      this.getGrowthMetricsForWindow(comparison.currentRange, days),
      this.getGrowthMetricsForWindow(comparison.previousRange, days),
    ]);

    return {
      window: comparison.metadata,
      current,
      previous,
      delta: {
        totalConfessions: this.buildNumericDelta(
          current.totalConfessions,
          previous.totalConfessions,
        ),
        averagePerDay: this.buildNumericDelta(
          current.averagePerDay,
          previous.averagePerDay,
        ),
      },
    };
  }

  async getUserActivityComparison(days: number = 7) {
    const comparison = this.getComparisonWindows(days);
    const [current, previous] = await Promise.all([
      this.getUserActivityForWindow(comparison.currentRange, days),
      this.getUserActivityForWindow(comparison.previousRange, days),
    ]);

    return {
      window: comparison.metadata,
      current,
      previous,
      delta: {
        averageDAU: this.buildNumericDelta(
          current.averageDAU,
          previous.averageDAU,
        ),
      },
    };
  }

  async getReactionDistributionComparison(days: number = 7) {
    const comparison = this.getComparisonWindows(days);
    const [current, previous] = await Promise.all([
      this.getReactionDistributionForWindow(comparison.currentRange, days),
      this.getReactionDistributionForWindow(comparison.previousRange, days),
    ]);

    const reactionTypes = new Set([
      ...current.distribution.map((item) => item.type),
      ...previous.distribution.map((item) => item.type),
    ]);

    return {
      window: comparison.metadata,
      current,
      previous,
      delta: {
        total: this.buildNumericDelta(current.total, previous.total),
        byType: Array.from(reactionTypes)
          .sort()
          .map((type) => {
            const currentEntry = current.distribution.find(
              (item) => item.type === type,
            );
            const previousEntry = previous.distribution.find(
              (item) => item.type === type,
            );
            const currentCount = currentEntry?.count || 0;
            const previousCount = previousEntry?.count || 0;

            return {
              type,
              currentCount,
              previousCount,
              ...this.buildNumericDelta(currentCount, previousCount),
            };
          }),
      },
    };
  }

  // Helper method to calculate trend
  private calculateTrend(data: Array<{ count: number }>): TrendDirection {
    if (data.length < 2) return 'stable';

    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));

    const firstAvg =
      firstHalf.reduce((sum, item) => sum + parseInt(item.count), 0) /
      firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, item) => sum + parseInt(item.count), 0) /
      secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  private getCurrentWindow(days: number): AnalyticsWindowRange {
    const { startAt, endAt } = toWindowBoundaries(days);
    return { startAt, endAt };
  }

  private getComparisonWindows(days: number): {
    currentRange: AnalyticsWindowRange;
    previousRange: AnalyticsWindowRange;
    metadata: ComparisonWindowMetadata;
  } {
    const currentRange = this.getCurrentWindow(days);
    const rangeSpan =
      currentRange.endAt.getTime() - currentRange.startAt.getTime();
    const previousRange = {
      startAt: new Date(currentRange.startAt.getTime() - rangeSpan),
      endAt: new Date(currentRange.startAt.getTime()),
    };

    return {
      currentRange,
      previousRange,
      metadata: {
        requestedDays: days,
        bucketUnit: 'day',
        bucketCount: this.getDateBuckets(currentRange).length,
        current: {
          startAt: currentRange.startAt.toISOString(),
          endAt: currentRange.endAt.toISOString(),
        },
        previous: {
          startAt: previousRange.startAt.toISOString(),
          endAt: previousRange.endAt.toISOString(),
        },
      },
    };
  }

  private async getGrowthMetricsForWindow(
    range: AnalyticsWindowRange,
    days: number,
  ): Promise<GrowthMetrics> {
    const rawGrowth = await this.confessionRepository
      .createQueryBuilder('confession')
      .select("DATE(confession.created_at AT TIME ZONE 'UTC')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('confession.created_at >= :startAt', { startAt: range.startAt })
      .andWhere('confession.created_at < :endAt', { endAt: range.endAt })
      .groupBy("DATE(confession.created_at AT TIME ZONE 'UTC')")
      .orderBy('date', 'ASC')
      .getRawMany<BucketCountRow>();

    const dailyGrowth = this.getDateBuckets(range).map((date) => ({
      date,
      count: this.findBucketCount(rawGrowth, date),
    }));
    const totalConfessions = dailyGrowth.reduce(
      (sum, item) => sum + item.count,
      0,
    );

    return {
      period: `${days} days`,
      totalConfessions,
      averagePerDay: parseFloat((totalConfessions / days).toFixed(2)),
      dailyGrowth,
      trend: this.calculateTrend(dailyGrowth),
    };
  }

  private async getUserActivityForWindow(
    range: AnalyticsWindowRange,
    days: number,
  ): Promise<UserActivityMetrics> {
    const rawActivityRows: unknown = await this.confessionRepository.manager.query(
      `
        SELECT activity.date::text AS date,
               COUNT(DISTINCT activity.anonymous_user_id)::int AS "activeUsers"
        FROM (
          SELECT DATE(confession.created_at AT TIME ZONE 'UTC') AS date,
                 confession.anonymous_user_id
          FROM anonymous_confessions confession
          WHERE confession.created_at >= $1 AND confession.created_at < $2
          UNION ALL
          SELECT DATE(reaction.created_at AT TIME ZONE 'UTC') AS date,
                 reaction.anonymous_user_id
          FROM reaction reaction
          WHERE reaction.created_at >= $1 AND reaction.created_at < $2
        ) activity
        GROUP BY activity.date
        ORDER BY activity.date ASC
      `,
      [range.startAt, range.endAt],
    );
    const activityRows = this.toBucketRows(rawActivityRows, 'activeUsers');

    const dailyActivity = this.getDateBuckets(range).map((date) => ({
      date,
      activeUsers: this.findBucketCount(activityRows, date, 'activeUsers'),
    }));
    const totalActiveUsers = dailyActivity.reduce(
      (sum, item) => sum + item.activeUsers,
      0,
    );

    return {
      period: `${days} days`,
      dailyActivity,
      averageDAU: parseFloat(
        (totalActiveUsers / dailyActivity.length || 0).toFixed(2),
      ),
    };
  }

  private async getReactionDistributionForWindow(
    range: AnalyticsWindowRange,
    days: number,
  ): Promise<ReactionDistributionMetrics> {
    const distribution = await this.reactionRepository
      .createQueryBuilder('reaction')
      .select('reaction.emoji', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('reaction.createdAt >= :startAt', { startAt: range.startAt })
      .andWhere('reaction.createdAt < :endAt', { endAt: range.endAt })
      .groupBy('reaction.emoji')
      .orderBy('type', 'ASC')
      .getRawMany<ReactionDistributionRow>();

    const total = distribution.reduce(
      (sum, item) => sum + parseInt(item.count, 10),
      0,
    );

    return {
      total,
      distribution: distribution.map((item) => {
        const count = parseInt(item.count, 10);
        return {
          type: item.type,
          count,
          percentage: total > 0 ? ((count / total) * 100).toFixed(2) : '0.00',
        };
      }),
      period: `${days} days`,
    };
  }

  private buildNumericDelta(current: number, previous: number) {
    const absoluteChange = parseFloat((current - previous).toFixed(2));
    const percentageChange =
      previous === 0
        ? null
        : parseFloat((((current - previous) / previous) * 100).toFixed(2));

    return {
      absoluteChange,
      percentageChange,
    };
  }

  private findBucketCount(
    rows: Array<Record<string, string | number>>,
    date: string,
    valueKey = 'count',
  ): number {
    const match = rows.find((row) => String(row.date) === date);
    if (!match) {
      return 0;
    }

    return parseInt(String(match[valueKey] || 0), 10);
  }

  private toBucketRows(
    rows: unknown,
    valueKey: string,
  ): Array<Record<string, string | number>> {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.flatMap((row) => {
      if (!row || typeof row !== 'object') {
        return [];
      }

      const record = row as Record<string, unknown>;
      const dateValue = record.date;
      const bucketValue = record[valueKey];

      if (
        typeof dateValue !== 'string' ||
        (typeof bucketValue !== 'string' && typeof bucketValue !== 'number')
      ) {
        return [];
      }

      return [{ date: dateValue, [valueKey]: bucketValue }];
    });
  }

  private getDateBuckets(range: AnalyticsWindowRange): string[] {
    const dates: string[] = [];
    const cursor = new Date(range.startAt.getTime());

    while (cursor.getTime() < range.endAt.getTime()) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  // ─── Targeted cache invalidation ───────────────────────────────────────────
  //
  // Each method invalidates only the segment that is affected by a given type
  // of mutation. Callers should prefer these over the full-flush invalidateCache().
  // All methods are fire-and-forget safe (errors are absorbed and logged by
  // CacheService.invalidateSegment).

  async invalidateTrendingCache(reason = 'mutation'): Promise<void> {
    this.logger.log(
      `Invalidating trending analytics cache (reason: ${reason})`,
    );
    await this.cacheService.invalidateSegment(
      InvalidationPrefixes.analyticsTrending,
      reason,
    );
  }

  async invalidateReactionDistributionCache(
    reason = 'mutation',
  ): Promise<void> {
    this.logger.log(
      `Invalidating reaction distribution cache (reason: ${reason})`,
    );
    await this.cacheService.invalidateSegment(
      InvalidationPrefixes.analyticsReactions,
      reason,
    );
  }

  async invalidateGrowthCache(reason = 'mutation'): Promise<void> {
    this.logger.log(`Invalidating growth metrics cache (reason: ${reason})`);
    await this.cacheService.invalidateSegment(
      InvalidationPrefixes.analyticsGrowth,
      reason,
    );
  }

  async invalidateUserActivityCache(reason = 'mutation'): Promise<void> {
    this.logger.log(`Invalidating user activity cache (reason: ${reason})`);
    await this.cacheService.invalidateSegment(
      InvalidationPrefixes.analyticsUsers,
      reason,
    );
  }

  async invalidateStatsCache(reason = 'mutation'): Promise<void> {
    this.logger.log(`Invalidating platform stats cache (reason: ${reason})`);
    // Use the namespace-compliant cache key for single key deletion
    await this.cacheService.del(AnalyticsCacheKeys.stats());
  }

  /**
   * Full-flush fallback retained for backward compatibility and admin use.
   * Prefer the targeted methods above for routine mutation-driven invalidation.
   */
  async invalidateCache(): Promise<void> {
    this.logger.warn('Full analytics cache flush requested');
    await Promise.all([
      this.invalidateTrendingCache('full-flush'),
      this.invalidateReactionDistributionCache('full-flush'),
      this.invalidateGrowthCache('full-flush'),
      this.invalidateUserActivityCache('full-flush'),
      this.invalidateStatsCache('full-flush'),
    ]);
  }
}
