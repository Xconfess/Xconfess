import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from './entities/bookmark.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';

export interface BookmarkToggleResult {
  bookmarked: boolean;
  bookmarkId: string | null;
}

export interface BookmarkPage {
  items: Bookmark[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class BookmarkService {
  constructor(
    @InjectRepository(Bookmark)
    private readonly bookmarkRepo: Repository<Bookmark>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepo: Repository<AnonymousConfession>,
  ) {}

  /**
   * Toggle bookmark on a confession for a user.
   * Returns { bookmarked: true, bookmarkId } on add, { bookmarked: false, bookmarkId: null } on remove.
   */
  async toggle(userId: number, confessionId: string): Promise<BookmarkToggleResult> {
    const confession = await this.confessionRepo.findOne({ where: { id: confessionId } });
    if (!confession) {
      throw new NotFoundException('Confession not found');
    }

    const existing = await this.bookmarkRepo.findOne({
      where: { userId, confessionId },
    });

    if (existing) {
      await this.bookmarkRepo.remove(existing);
      return { bookmarked: false, bookmarkId: null };
    }

    const bookmark = this.bookmarkRepo.create({ userId, confessionId });
    const saved = await this.bookmarkRepo.save(bookmark);
    return { bookmarked: true, bookmarkId: saved.id };
  }

  /** Paginated list of bookmarks for a user, newest first. */
  async list(userId: number, page: number, limit: number): Promise<BookmarkPage> {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const [items, total] = await this.bookmarkRepo.findAndCount({
      where: { userId },
      relations: ['confession'],
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return { items, total, page, limit: take };
  }

  /** Check if a single confession is bookmarked by the user. */
  async isBookmarked(userId: number, confessionId: string): Promise<boolean> {
    const count = await this.bookmarkRepo.count({ where: { userId, confessionId } });
    return count > 0;
  }

  /** Remove a bookmark explicitly (non-toggle, returns 404 if not bookmarked). */
  async remove(userId: number, confessionId: string): Promise<void> {
    const existing = await this.bookmarkRepo.findOne({
      where: { userId, confessionId },
    });
    if (!existing) {
      throw new NotFoundException('Bookmark not found');
    }
    await this.bookmarkRepo.remove(existing);
  }

  /** Total bookmark count for a user (private, not exposed publicly). */
  async countForUser(userId: number): Promise<number> {
    return this.bookmarkRepo.count({ where: { userId } });
  }
}
