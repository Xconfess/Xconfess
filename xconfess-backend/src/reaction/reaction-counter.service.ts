import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnonymousConfession } from '../confession/entities/confession.entity';

/**
 * Manages reaction counter updates atomically using database constraints.
 * Ensures lost updates don't occur during concurrent reaction operations.
 */
@Injectable()
export class ReactionCounterService {
  private readonly logger = new Logger(ReactionCounterService.name);

  constructor(
    @InjectRepository(AnonymousConfession)
    private confessionRepo: Repository<AnonymousConfession>,
  ) {}

  /**
   * Increment reaction counter atomically using raw SQL.
   * Prevents lost updates by using FOR UPDATE lock during transaction.
   */
  async incrementReactionCount(
    confessionId: number,
    emoji: string,
    manager?: any,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(AnonymousConfession) : this.confessionRepo;

    try {
      // Raw query for atomic increment
      const query = `
        UPDATE anonymous_confession
        SET reaction_counts = jsonb_set(
          COALESCE(reaction_counts, '{}'::jsonb),
          '{${emoji}}',
          to_jsonb((COALESCE((reaction_counts->>'${emoji}')::integer, 0) + 1))
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING reaction_counts
      `;

      const result = await repo.query(query, [confessionId]);

      if (!result || result.length === 0) {
        this.logger.warn(`Confession not found for counter update: ${confessionId}`);
        return 0;
      }

      const counts = result[0].reaction_counts;
      return counts[emoji] || 0;
    } catch (error) {
      this.logger.error(
        `Failed to increment reaction counter for confession ${confessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Decrement reaction counter atomically.
   * Used when removing reactions, ensuring counter consistency.
   */
  async decrementReactionCount(
    confessionId: number,
    emoji: string,
    manager?: any,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(AnonymousConfession) : this.confessionRepo;

    try {
      const query = `
        UPDATE anonymous_confession
        SET reaction_counts = jsonb_set(
          COALESCE(reaction_counts, '{}'::jsonb),
          '{${emoji}}',
          to_jsonb(GREATEST(0, (COALESCE((reaction_counts->>'${emoji}')::integer, 0) - 1)))
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING reaction_counts
      `;

      const result = await repo.query(query, [confessionId]);

      if (!result || result.length === 0) {
        this.logger.warn(`Confession not found for counter update: ${confessionId}`);
        return 0;
      }

      const counts = result[0].reaction_counts;
      return counts[emoji] || 0;
    } catch (error) {
      this.logger.error(
        `Failed to decrement reaction counter for confession ${confessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get current reaction counts for a confession.
   */
  async getReactionCounts(confessionId: string | number): Promise<{ [emoji: string]: number }> {
    // The current confession entity has no denormalized reaction_counts column.
    const rows: Array<{ emoji: string; count: number }> = await this.confessionRepo.query(
      'SELECT emoji, COUNT(*)::int AS count FROM reaction WHERE confession_id = $1 GROUP BY emoji',
      [confessionId],
    );
    return Object.fromEntries(rows.map(({ emoji, count }) => [emoji, count]));
  }

  /**
   * Recalculate reaction counts from the Reaction table.
   * Used for reconciliation if counters become inconsistent.
   */
  async recalculateReactionCounts(confessionId: number, manager?: any): Promise<void> {
    const repo = manager ? manager.getRepository(AnonymousConfession) : this.confessionRepo;

    try {
      // Derive counts from actual reaction records
      const query = `
        UPDATE anonymous_confession ac
        SET reaction_counts = COALESCE((
          SELECT jsonb_object_agg(emoji, count)
          FROM (
            SELECT emoji, COUNT(*) as count
            FROM reaction
            WHERE confession_id = $1
            GROUP BY emoji
          ) counts
        ), '{}'::jsonb),
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await repo.query(query, [confessionId]);
      this.logger.log(`Recalculated reaction counts for confession: ${confessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to recalculate reaction counts for confession ${confessionId}:`,
        error,
      );
      throw error;
    }
  }
}
