import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { SavedSearch } from './entities/saved-search.entity';
import { SearchHistory } from './entities/search-history.entity';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto';
import { SearchConfessionDto } from '../confession/dto/search-confession.dto';

interface ExtendedSearchDto extends SearchConfessionDto {
  dateFrom?: string;
  dateTo?: string;
  sort?: 'newest' | 'oldest' | 'reactions';
}

@Injectable()
export class SearchDiscoveryService {
  constructor(
    @InjectRepository(SavedSearch)
    private savedSearchRepo: Repository<SavedSearch>,
    @InjectRepository(SearchHistory)
    private searchHistoryRepo: Repository<SearchHistory>,
  ) {}

  private normalizeFilters(dto: ExtendedSearchDto): any {
    const { q, page, limit, ...filters } = dto;
    return Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v != null),
    );
  }

  private generateQueryHash(q: string, filters: any): string {
    const data = JSON.stringify(
      { q, ...filters },
      Object.keys({ q, ...filters }).sort(),
    );
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // =========================================================
  // EXECUTE FULL TEXT SEARCH WITH FILTERS & HISTORY LOGGING
  // =========================================================
  async executeFullTextSearch(userId: number, dto: ExtendedSearchDto) {
    // Automatically log the entry to history if a text keyword query is passed
    if (dto.q && dto.q.trim()) {
      await this.recordSearch(userId, dto);
    }

    const q = dto.q?.trim() || '';
    const manager = this.searchHistoryRepo.manager;
    const conditions: string[] = ['is_deleted = false'];
    const parameters: any[] = [];
    let paramIndex = 1;

    // Clamp limit to safe range [1, 100]; use 40 as default
    const limit = Math.min(Math.max(Number(dto.limit) || 40, 1), 100);

    let selectFields = `id, title, body as "highlightedBody", category, reaction_count as "reactionCount", gender, created_at as "createdAt"`;
    let orderBy = `"createdAt" DESC`;

    if (q) {
      parameters.push(q);

      // Native Postgres full-text vectors parsing with clean Tailwind highlight wrappers
      selectFields = `
        id,
        title,
        category,
        reaction_count as "reactionCount",
        gender,
        created_at as "createdAt",
        ts_headline('english', body, plainto_tsquery('english', $${paramIndex}), 'StartSel=<mark class="bg-yellow-500/30 text-yellow-200 px-1 rounded font-semibold">, StopSel=</mark>, MaxWords=60') as "highlightedBody"
      `;
      conditions.push(
        `to_tsvector('english', body) @@ plainto_tsquery('english', $${paramIndex})`,
      );
      orderBy = `ts_rank(to_tsvector('english', body), plainto_tsquery('english', $${paramIndex})) DESC`;
      paramIndex++;
    }

    // Process options criteria mappings dynamically
    if (dto.dateFrom) {
      parameters.push(dto.dateFrom);
      conditions.push(`created_at >= $${paramIndex}::timestamp`);
      paramIndex++;
    }
    if (dto.dateTo) {
      parameters.push(dto.dateTo);
      conditions.push(`created_at <= $${paramIndex}::timestamp`);
      paramIndex++;
    }
    if (dto.minReactions && dto.minReactions > 0) {
      parameters.push(dto.minReactions);
      conditions.push(`reaction_count >= $${paramIndex}`);
      paramIndex++;
    }
    if (dto.gender) {
      parameters.push(dto.gender);
      conditions.push(`gender = $${paramIndex}`);
      paramIndex++;
    }

    if (dto.sort === 'oldest') orderBy = `"createdAt" ASC`;
    if (dto.sort === 'reactions') orderBy = `"reactionCount" DESC`;

    parameters.push(limit);
    const rawQuery = `
      SELECT ${selectFields}
      FROM confessions
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex}
    `;

    const results = await manager.query(rawQuery, parameters);
    return { results };
  }

  async savePreset(userId: number, dto: CreateSavedSearchDto) {
    const filters = this.normalizeFilters(dto.filters as ExtendedSearchDto);
    let preset = await this.savedSearchRepo.findOne({
      where: { userId, name: dto.name },
    });

    if (preset) {
      if (preset.userId !== userId) {
        throw new NotFoundException('Saved preset not found or unauthorized');
      }
      preset.filters = filters;
      return this.savedSearchRepo.save(preset);
    }

    preset = this.savedSearchRepo.create({
      userId,
      name: dto.name,
      filters,
    });
    return this.savedSearchRepo.save(preset);
  }

  async listPresets(userId: number) {
    return this.savedSearchRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async deletePreset(userId: number, id: string) {
    const result = await this.savedSearchRepo.delete({ id, userId });
    // If nothing was deleted, either it doesn't exist or isn't owned by user
    if ((result as any)?.affected === 0) {
      throw new NotFoundException('Saved preset not found or unauthorized');
    }
    return result;
  }

  async recordSearch(userId: number, dto: ExtendedSearchDto) {
    const q = dto.q?.trim() || '';
    if (!q) return;
    const filters = this.normalizeFilters(dto);
    const queryHash = this.generateQueryHash(q, filters);

    const existing = await this.searchHistoryRepo.findOne({
      where: { userId, queryHash },
    });

    if (existing) {
      await this.searchHistoryRepo.save(existing);
    } else {
      const history = this.searchHistoryRepo.create({
        userId,
        query: q,
        filters,
        queryHash,
      });
      await this.searchHistoryRepo.save(history);
    }

    const count = await this.searchHistoryRepo.count({ where: { userId } });
    if (count > 20) {
      const oldest = await this.searchHistoryRepo.find({
        where: { userId },
        order: { usedAt: 'ASC' },
        take: count - 20,
      });
      if (oldest.length > 0) {
        await this.searchHistoryRepo.remove(oldest);
      }
    }
  }

  async getRecentSearches(userId: number) {
    return this.searchHistoryRepo.find({
      where: { userId },
      order: { usedAt: 'DESC' },
      take: 20,
    });
  }
}
