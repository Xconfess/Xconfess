import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnonymousConfession } from './entities/confession.entity';

@Injectable()
export class ConfessionSchedulerService {
  private readonly logger = new Logger(ConfessionSchedulerService.name);

  constructor(
    @InjectRepository(AnonymousConfession)
    private confessionRepository: Repository<AnonymousConfession>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledConfessions() {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AnonymousConfession);
      const now = new Date();

      const scheduledConfessions = await repo
        .createQueryBuilder('confession')
        .setLock('pessimistic_write')
        .where('confession.status = :status', { status: 'scheduled' })
        .andWhere('confession.publishAt <= :now', { now })
        .getMany();

      for (const confession of scheduledConfessions) {
        try {
          const result = await repo
            .createQueryBuilder()
            .update(AnonymousConfession)
            .set({
              status: 'published',
              created_at: now,
            })
            .where('id = :id', { id: confession.id })
            .andWhere('status = :status', { status: 'scheduled' })
            .execute();

          if (result.affected && result.affected > 0) {
            this.logger.log(
              `Published scheduled confession id=${confession.id} publishAt=${confession.publishAt?.toISOString()}`,
            );
          } else {
            this.logger.warn(
              `Skipped already-published confession id=${confession.id} (status no longer 'scheduled')`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to publish scheduled confession id=${confession.id}: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    });
  }

  async scheduleConfession(
    confessionId: string,
    publishAt: Date,
  ): Promise<AnonymousConfession> {
    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
    });

    if (!confession) {
      throw new Error('Confession not found');
    }

    if (publishAt <= new Date()) {
      throw new Error('Publish date must be in the future');
    }

    confession.status = 'scheduled';
    confession.publishAt = publishAt;

    return this.confessionRepository.save(confession);
  }

  async cancelSchedule(confessionId: string): Promise<AnonymousConfession> {
    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
    });

    if (!confession) {
      throw new Error('Confession not found');
    }

    confession.status = 'draft';
    confession.publishAt = null;

    return this.confessionRepository.save(confession);
  }

  async getScheduledConfessions(
    userId: string,
  ): Promise<AnonymousConfession[]> {
    return this.confessionRepository.find({
      where: {
        anonymousUserId: userId,
        status: 'scheduled',
      },
      order: {
        publishAt: 'ASC',
      },
    });
  }
}
