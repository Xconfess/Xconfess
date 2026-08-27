import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Tag } from './entities/tag.entity';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
  ) {}

  /**
   * Get all available tags
   */
  async getAllTags(): Promise<Tag[]> {
    return this.tagRepository.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * Validate that the provided tag names exist in the database
   * @param tagNames Array of tag names to validate
   * @returns Array of Tag entities
   * @throws BadRequestException if any tag is invalid
   */
  async validateTags(tagNames: string[]): Promise<Tag[]> {
    if (!tagNames || tagNames.length === 0) {
      return [];
    }

    // Normalize tag names (lowercase, trim)
    const normalizedNames = tagNames.map((name) => name.toLowerCase().trim());

    // Remove duplicates
    const uniqueNames = [...new Set(normalizedNames)];

    // Check max limit
    if (uniqueNames.length > 3) {
      throw new BadRequestException('Maximum 3 tags allowed per confession');
    }

    // Find tags in database
    const tags = await this.tagRepository.find({
      where: { name: In(uniqueNames) },
    });

    // Check if all tags were found
    if (tags.length !== uniqueNames.length) {
      const foundNames = tags.map((tag) => tag.name);
      const invalidTags = uniqueNames.filter(
        (name) => !foundNames.includes(name),
      );
      throw new BadRequestException(
        `Invalid tags: ${invalidTags.join(', ')}. Please use only predefined tags.`,
      );
    }

    return tags;
  }

  /**
   * Get a single tag by name
   */
  async getTagByName(name: string): Promise<Tag | null> {
    return this.tagRepository.findOne({
      where: { name: name.toLowerCase().trim() },
    });
  }

  /**
   * Get popular tags (most used)
   * This is a placeholder for future enhancement
   */
  async getPopularTags(limit: number = 10): Promise<Tag[]> {
    // For now, just return all tags
    // In the future, we can join with confession_tags and count
    return this.tagRepository.find({
      take: limit,
      order: { name: 'ASC' },
    });
  }
}
