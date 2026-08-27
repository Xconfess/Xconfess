import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { AnonymousUser } from './entities/anonymous-user.entity';
import { UserAnonymousUser } from './entities/user-anonymous-link.entity';

@Injectable()
export class AnonymousUserService {
  constructor(
    @InjectRepository(AnonymousUser)
    private anonymousUserRepository: Repository<AnonymousUser>,
    @InjectRepository(UserAnonymousUser)
    private readonly userAnonRepo: Repository<UserAnonymousUser>,
  ) {}

  async create(): Promise<AnonymousUser> {
    const anon = this.anonymousUserRepository.create();
    return this.anonymousUserRepository.save(anon);
  }

  async getOrCreateForUserSession(
    userId: number,
    sessionWindowHours: number = 24,
  ): Promise<AnonymousUser> {
    // Calculate the session window cutoff time
    const sessionCutoff = new Date();
    sessionCutoff.setHours(sessionCutoff.getHours() - sessionWindowHours);

    // Look for existing anonymous user within the session window
    const existingLink = await this.userAnonRepo.findOne({
      where: {
        userId,
        createdAt: MoreThan(sessionCutoff),
      },
      relations: ['anonymousUser'],
      order: {
        createdAt: 'DESC',
      },
    });

    if (existingLink && existingLink.anonymousUser) {
      return existingLink.anonymousUser;
    }

    // Create new anonymous user for this session
    const anon = await this.create();
    await this.userAnonRepo.save(
      this.userAnonRepo.create({
        userId,
        anonymousUserId: anon.id,
      }),
    );
    return anon;
  }

  async findById(id: string): Promise<AnonymousUser | null> {
    return this.anonymousUserRepository.findOne({ where: { id } });
  }

  async rotateAnonymousContext(userId: number): Promise<AnonymousUser> {
    // Create new anonymous user for rotation
    const newAnon = await this.create();
    await this.userAnonRepo.save(
      this.userAnonRepo.create({
        userId,
        anonymousUserId: newAnon.id,
      }),
    );
    return newAnon;
  }

  async getAnonIdsForUser(userId: number): Promise<string[]> {
    const links = await this.userAnonRepo.find({
      where: { userId },
      select: ['anonymousUserId'],
    });
    return links.map((link) => link.anonymousUserId);
  }

  async cleanupExpiredSessions(sessionWindowHours: number = 24): Promise<void> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - sessionWindowHours);

    // Delete expired user-anonymous links (cascades to anonymous users if no other links)
    await this.userAnonRepo.delete({
      createdAt: MoreThan(cutoff),
    });
  }
}
