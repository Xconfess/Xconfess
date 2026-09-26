import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnonymousConfession } from '../confession/entities/confession.entity';

@Injectable()
export class SearchDeterminismService {
  private readonly logger = new Logger(SearchDeterminismService.name);

  constructor(
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
  ) {}

  private generateTiebreaker(id: string, createdAt: Date): number {
    const epochSeconds = Math.floor(createdAt.getTime() / 1000);
    const idHash = this.hashIdToNumber(id);
    return epochSeconds * 1000000 + (idHash % 1000000);
  }

  private hashIdToNumber(id: string): number {
    let hash = 0;
    for (let i = 0; i < Math.min(8, id.length); i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  async initializeTiebreakers(): Promise<void> {
    const confessions = await this.confessionRepository.find({
      where: {
        searchScoreTiebreaker: null,
      },
    });

    if (confessions.length === 0) {
      this.logger.debug('No confessions need tiebreaker initialization');
      return;
    }

    for (const confession of confessions) {
      confession.searchScoreTiebreaker = this.generateTiebreaker(
        confession.id,
        confession.created_at,
      );
    }

    await this.confessionRepository.save(confessions);
    this.logger.log(
      `Initialized tiebreakers for ${confessions.length} confessions`,
    );
  }

  async ensureTiebreakerForNew(confession: AnonymousConfession): Promise<void> {
    if (!confession.searchScoreTiebreaker) {
      confession.searchScoreTiebreaker = this.generateTiebreaker(
        confession.id,
        confession.created_at,
      );
    }
  }

  buildDeterministicOrderBy(
    primarySort: string,
    useSecondaryTiebreaker: boolean = true,
  ): string {
    if (!useSecondaryTiebreaker) {
      return primarySort;
    }

    // When scores are equal, use tiebreaker (created_at + id hash)
    return `${primarySort}, search_score_tiebreaker ASC, created_at DESC`;
  }

  async getDeterministicResults(
    query: string,
    limit: number = 40,
    offset: number = 0,
  ): Promise<AnonymousConfession[]> {
    return this.confessionRepository
      .createQueryBuilder('confession')
      .select([
        'confession.id',
        'confession.message',
        'confession.created_at',
        'confession.searchScoreTiebreaker',
      ])
      .where('confession.isDeleted = false')
      .orderBy('confession.searchScoreTiebreaker', 'ASC')
      .addOrderBy('confession.created_at', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();
  }

  async validatePaginationConsistency(
    query: string,
    pageSize: number = 40,
    maxPages: number = 3,
  ): Promise<{ isConsistent: boolean; duplicates: string[]; gaps: string[] }> {
    const duplicates: string[] = [];
    const gaps: string[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      const results = await this.getDeterministicResults(
        query,
        pageSize,
        offset,
      );

      for (const result of results) {
        if (seenIds.has(result.id)) {
          duplicates.push(result.id);
        }
        seenIds.add(result.id);
      }

      if (results.length < pageSize && page < maxPages - 1) {
        gaps.push(`Page ${page} returned fewer items than expected`);
      }
    }

    const isConsistent = duplicates.length === 0 && gaps.length === 0;

    if (!isConsistent) {
      this.logger.warn(
        `Pagination consistency check failed: ${duplicates.length} duplicates, ${gaps.length} gaps`,
      );
    }

    return { isConsistent, duplicates, gaps };
  }
}
