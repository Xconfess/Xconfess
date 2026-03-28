// ...existing code...
import { DataSource, Repository, FindOptionsWhere, ILike } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { AnonymousConfession } from '../entities/confession.entity';
import { SearchConfessionDto } from '../dto/search-confession.dto';

/**
 * Repository for handling database operations related to anonymous confessions.
 * Extends TypeORM's Repository to provide additional functionality.
 */
@Injectable()
export class AnonymousConfessionRepository extends Repository<AnonymousConfession> {
  constructor(private dataSource: DataSource) {
    super(AnonymousConfession, dataSource.createEntityManager());
  }

  /**
   * Find a confession by its ID with its reactions.
   * @param id The UUID of the confession
   * @returns The confession with its reactions, or null if not found
   */
  async findByIdWithReactions(id: string): Promise<AnonymousConfession | null> {
    return this.findOne({
      where: { id },
      relations: ['reactions'],
    });
  }

  /**
   * Find confessions by a search term in the message using basic ILIKE.
   * Filters out confessions from non-discoverable users.
   * @param searchTerm The term to search for in confession messages
   * @returns Array of confessions matching the search term
   */
  async findBySearchTerm(searchTerm: string): Promise<AnonymousConfession[]> {
    return this.createQueryBuilder('confession')
      .leftJoinAndSelect('confession.anonymousUser', 'anonymousUser')
      .leftJoinAndSelect('anonymousUser.userLinks', 'userLinks')
      .leftJoinAndSelect('userLinks.user', 'user')
      .where('confession.message ILIKE :searchTerm', {
        searchTerm: `%${searchTerm}%`,
      })
      .andWhere(
        "(anonymousUser.userLinks IS NULL OR anonymousUser.userLinks = '{}' OR user.privacy_settings IS NULL OR user.privacy_settings->>'isDiscoverable' = 'true' OR JSON_TYPE(user.privacy_settings, '$.isDiscoverable') IS NULL)",
      )
      .orderBy('confession.created_at', 'DESC')
      .getMany();
  }

  /**
   * Full-text search confessions using PostgreSQL's tsvector and ts_rank.
   * Filters out confessions from non-discoverable users.
   * @param searchTerm The search query
   * @param page Page number for pagination
   * @param limit Number of results per page
   * @param dto Optional search filters including anonymousOnly
   * @returns Array of confessions ranked by relevance
   */
  async fullTextSearch(
    searchTerm: string,
    page: number = 1,
    limit: number = 10,
    dto?: Partial<SearchConfessionDto>,
  ): Promise<{
    confessions: AnonymousConfession[];
    total: number;
  }> {
    const safeLimit = typeof limit === 'number' ? limit : 10;
    const offset = (page - 1) * safeLimit;

    const sanitizedTerm = searchTerm
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .join(' & ');

    if (!sanitizedTerm) {
      return { confessions: [], total: 0 };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    let hasSearchVector = false;
    try {
      const columns = await queryRunner.getTable('confession');
      hasSearchVector = !!columns?.findColumnByName('search_vector');
    } finally {
      await queryRunner.release();
    }
    if (!hasSearchVector) {
      return { confessions: [], total: 0 };
    }

    // Build the query with ts_rank for relevance scoring
    const queryBuilder = this.createQueryBuilder('confession')
      .leftJoinAndSelect('confession.anonymousUser', 'anonymousUser')
      .leftJoinAndSelect('anonymousUser.userLinks', 'userLinks')
      .leftJoinAndSelect('userLinks.user', 'user')
      .leftJoinAndSelect('confession.reactions', 'reactions')
      .where('confession.search_vector @@ plainto_tsquery(:sanitizedTerm)', {
        sanitizedTerm,
      })
      .andWhere('confession.isDeleted = false')
      .andWhere('confession.isHidden = false')
      .andWhere('confession.moderationStatus IN (:...statuses)', {
        statuses: ['approved', 'pending'],
      })
      .andWhere(
        "(anonymousUser.userLinks IS NULL OR anonymousUser.userLinks = '{}' OR user.privacy_settings IS NULL OR user.privacy_settings->>'isDiscoverable' = 'true' OR JSON_TYPE(user.privacy_settings, '$.isDiscoverable') IS NULL)",
      );

    // Apply anonymous-only filter if requested
    if (dto?.anonymousOnly) {
      queryBuilder.andWhere('userLinks.id IS NULL');
    }

    queryBuilder
      .addSelect(
        'ts_rank(confession.search_vector, plainto_tsquery(:sanitizedTerm))',
        'rank',
      )
      .orderBy('rank', 'DESC')
      .addOrderBy('confession.created_at', 'DESC')
      .skip(offset)
      .take(limit);

    // Get total count for pagination
    const totalQuery = this.createQueryBuilder('confession')
      .leftJoin('confession.anonymousUser', 'anonymousUser')
      .leftJoin('anonymousUser.userLinks', 'userLinks')
      .leftJoin('userLinks.user', 'user')
      .where('confession.search_vector @@ plainto_tsquery(:sanitizedTerm)', {
        sanitizedTerm,
      })
      .andWhere('confession.isDeleted = false')
      .andWhere('confession.isHidden = false')
      .andWhere('confession.moderationStatus IN (:...statuses)', {
        statuses: ['approved', 'pending'],
      })
      .andWhere(
        "(anonymousUser.userLinks IS NULL OR anonymousUser.userLinks = '{}' OR user.privacy_settings IS NULL OR user.privacy_settings->>'isDiscoverable' = 'true' OR JSON_TYPE(user.privacy_settings, '$.isDiscoverable') IS NULL)",
      );

    if (dto?.anonymousOnly) {
      totalQuery.andWhere('userLinks.id IS NULL');
    }

    let confessions: AnonymousConfession[] = [];
    let total = 0;
    try {
      [confessions, total] = await Promise.all([
        queryBuilder.getMany(),
        totalQuery.getCount(),
      ]);
    } catch (err) {
      return { confessions: [], total: 0 };
    }

    return { confessions, total };
  }

  /**
   * Hybrid search that combines full-text search with fallback to ILIKE.
   * Filters out confessions from non-discoverable users.
   * @param searchTerm The search query
   * @param page Page number for pagination
   * @param limit Number of results per page
   * @param dto Optional search filters including anonymousOnly
   * @returns Array of confessions with relevance ranking
   */
  async hybridSearch(
    searchTerm: string,
    page: number = 1,
    limit: number = 10,
    dto?: Partial<SearchConfessionDto>,
  ): Promise<{
    confessions: AnonymousConfession[];
    total: number;
  }> {
    const safeLimit = typeof limit === 'number' ? limit : 10;
    const fullTextResult = await this.fullTextSearch(
      searchTerm,
      page,
      safeLimit,
      dto,
    );

    if (fullTextResult.total > 0) {
      return fullTextResult;
    }

    const offset = (page - 1) * safeLimit;

    const queryBuilder = this.createQueryBuilder('confession')
      .leftJoinAndSelect('confession.anonymousUser', 'anonymousUser')
      .leftJoinAndSelect('anonymousUser.userLinks', 'userLinks')
      .leftJoinAndSelect('userLinks.user', 'user')
      .leftJoinAndSelect('confession.reactions', 'reactions')
      .where('confession.message ILIKE :searchTerm', {
        searchTerm: `%${searchTerm}%`,
      })
      .andWhere('confession.isDeleted = false')
      .andWhere('confession.isHidden = false')
      .andWhere('confession.moderationStatus IN (:...statuses)', {
        statuses: ['approved', 'pending'],
      })
      .andWhere(
        "(anonymousUser.userLinks IS NULL OR anonymousUser.userLinks = '{}' OR user.privacy_settings IS NULL OR user.privacy_settings->>'isDiscoverable' = 'true' OR JSON_TYPE(user.privacy_settings, '$.isDiscoverable') IS NULL)",
      );

    // Apply anonymous-only filter if requested
    if (dto?.anonymousOnly) {
      queryBuilder.andWhere('userLinks.id IS NULL');
    }

    queryBuilder
      .orderBy('confession.created_at', 'DESC')
      .skip(offset)
      .take(safeLimit);

    const totalQuery = this.createQueryBuilder('confession')
      .leftJoin('confession.anonymousUser', 'anonymousUser')
      .leftJoin('anonymousUser.userLinks', 'userLinks')
      .leftJoin('userLinks.user', 'user')
      .where('confession.message ILIKE :searchTerm', {
        searchTerm: `%${searchTerm}%`,
      })
      .andWhere('confession.isDeleted = false')
      .andWhere('confession.isHidden = false')
      .andWhere('confession.moderationStatus IN (:...statuses)', {
        statuses: ['approved', 'pending'],
      })
      .andWhere(
        "(anonymousUser.userLinks IS NULL OR anonymousUser.userLinks = '{}' OR user.privacy_settings IS NULL OR user.privacy_settings->>'isDiscoverable' = 'true' OR JSON_TYPE(user.privacy_settings, '$.isDiscoverable') IS NULL)",
      );

    if (dto?.anonymousOnly) {
      totalQuery.andWhere('userLinks.id IS NULL');
    }

    const [confessions, total] = await Promise.all([
      queryBuilder.getMany(),
      totalQuery.getCount(),
    ]);

    return { confessions, total };
  }

  /**
   * Find recent confessions with pagination.
   * @param page The page number (1-based)
   * @param limit The number of items per page
   * @returns Array of confessions for the specified page
   */
  async findRecent(
    page: number = 1,
    limit: number = 10,
  ): Promise<AnonymousConfession[]> {
    return this.find({
      order: {
        created_at: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['reactions'],
    });
  }

  /**
   * Count total number of confessions.
   * @returns The total count of confessions
   */
  async countTotal(): Promise<number> {
    return this.count();
  }

  /**
   * Atomically increment the view count of a confession.
   * @param id The UUID of the confession
   */
  async incrementViewCountAtomically(id: string): Promise<void> {
    const result = await this.increment({ id }, 'view_count', 1);
    if (result.affected === 0) {
      throw new Error(`Confession with ID ${id} not found`);
    }
  }

  /**
   * Fetch top trending confessions based on view count, recent reactions, and recency.
   * Filters out confessions from non-discoverable users.
   * Trending score = view_count * 1 + recent_reactions * 3 + 10 / (1 + hours_since_created)
   *
   * Window boundaries
   * ─────────────────
   * • startAt (inclusive) – confessions created on or after this UTC timestamp
   *   are eligible.  Reactions are also weighted only within this window.
   * • endAt   (exclusive) – confessions created before this UTC timestamp are
   *   eligible; equal-to records are excluded so consecutive windows never
   *   double-count a confession written exactly at midnight.
   *
   * When not supplied, falls back to the previous 24-hour rolling window so
   * existing callers that omit the arguments are unaffected.
   */
  async findTrending(
    limit: number = 10,
    startAt?: Date,
    endAt?: Date,
  ): Promise<AnonymousConfession[]> {
    // Default to UTC-floored boundaries when not provided by the caller.
    const now = new Date();
    const todayUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const resolvedStartAt = startAt ?? new Date(todayUTC - 24 * 60 * 60 * 1000);
    const resolvedEndAt = endAt ?? new Date(todayUTC + 24 * 60 * 60 * 1000);

    return this.createQueryBuilder('confession')
      .leftJoinAndSelect('confession.anonymousUser', 'anonymousUser')
      .leftJoinAndSelect('anonymousUser.userLinks', 'userLinks')
      .leftJoinAndSelect('userLinks.user', 'user')
      .leftJoinAndSelect('confession.reactions', 'reactions')
      .addSelect(
        // Recent-reaction weight uses the same inclusive-start/exclusive-end
        // boundaries so the score is consistent with the window filter below.
        `confession.view_count + 3 * COUNT(CASE WHEN reactions.createdAt >= :startAt AND reactions.createdAt < :endAt THEN 1 END) + 10.0 / (1 + EXTRACT(EPOCH FROM (NOW() - confession.created_at)) / 3600)`,
        'trending_score',
      )
      .where('confession.created_at IS NOT NULL')
      .andWhere('confession.created_at >= :startAt', {
        startAt: resolvedStartAt,
      })
      .andWhere('confession.created_at < :endAt', { endAt: resolvedEndAt })
      .andWhere('confession.isDeleted = false')
      .andWhere(
        "(anonymousUser.userLinks IS NULL OR anonymousUser.userLinks = '{}' OR user.privacy_settings IS NULL OR user.privacy_settings->>'isDiscoverable' = 'true' OR JSON_TYPE(user.privacy_settings, '$.isDiscoverable') IS NULL)",
      )
      .groupBy('confession.id')
      .orderBy('trending_score', 'DESC')
      .limit(limit)
      .setParameter('startAt', resolvedStartAt.toISOString())
      .setParameter('endAt', resolvedEndAt.toISOString())
      .getMany();
  }

  /**
   * Find confessions by tag with pagination
   * Filters out confessions from non-discoverable users.
   * @param tagName The name of the tag to filter by
   * @param page Page number for pagination
   * @param limit Number of results per page
   * @returns Object containing confessions and total count
   */
  async findByTag(
    tagName: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    confessions: AnonymousConfession[];
    total: number;
  }> {
    const safeLimit = typeof limit === 'number' ? limit : 10;
    const offset = (page - 1) * safeLimit;

    const queryBuilder = this.createQueryBuilder('confession')
      .innerJoin('confession.confessionTags', 'confessionTag')
      .innerJoin('confessionTag.tag', 'tag')
      .leftJoinAndSelect('confession.anonymousUser', 'anonymousUser')
      .leftJoinAndSelect('anonymousUser.userLinks', 'userLinks')
      .leftJoinAndSelect('userLinks.user', 'user')
      .leftJoinAndSelect('confession.reactions', 'reactions')
      .leftJoinAndSelect('reactions.anonymousUser', 'reactionUser')
      .where('tag.name = :tagName', { tagName: tagName.toLowerCase().trim() })
      .andWhere('confession.isDeleted = false')
      .andWhere('confession.isHidden = false')
      .andWhere('confession.moderationStatus IN (:...statuses)', {
        statuses: ['approved', 'pending'],
      })
      .andWhere(
        "(anonymousUser.userLinks IS NULL OR anonymousUser.userLinks = '{}' OR user.privacy_settings IS NULL OR user.privacy_settings->>'isDiscoverable' = 'true' OR JSON_TYPE(user.privacy_settings, '$.isDiscoverable') IS NULL)",
      )
      .select([
        'confession.id',
        'confession.message',
        'confession.gender',
        'confession.created_at',
        'confession.view_count',
        'confession.moderationStatus',
        'reactions.id',
        'reactions.emoji',
        'reactions.created_at',
        'reactionUser.id',
      ])
      .orderBy('confession.created_at', 'DESC')
      .skip(offset)
      .take(safeLimit);

    const totalQuery = this.createQueryBuilder('confession')
      .innerJoin('confession.confessionTags', 'confessionTag')
      .innerJoin('confessionTag.tag', 'tag')
      .leftJoin('confession.anonymousUser', 'anonymousUser')
      .leftJoin('anonymousUser.userLinks', 'userLinks')
      .leftJoin('userLinks.user', 'user')
      .where('tag.name = :tagName', { tagName: tagName.toLowerCase().trim() })
      .andWhere('confession.isDeleted = false')
      .andWhere('confession.isHidden = false')
      .andWhere('confession.moderationStatus IN (:...statuses)', {
        statuses: ['approved', 'pending'],
      })
      .andWhere(
        "(anonymousUser.userLinks IS NULL OR anonymousUser.userLinks = '{}' OR user.privacy_settings IS NULL OR user.privacy_settings->>'isDiscoverable' = 'true' OR JSON_TYPE(user.privacy_settings, '$.isDiscoverable') IS NULL)",
      );

    const [confessions, total] = await Promise.all([
      queryBuilder.getMany(),
      totalQuery.getCount(),
    ]);

    return { confessions, total };
  }
}
