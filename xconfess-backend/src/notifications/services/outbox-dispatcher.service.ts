import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Brackets } from 'typeorm';
import {
  OutboxEvent,
  OutboxStatus,
} from '../../common/entities/outbox-event.entity';
import { NotificationService } from './notification.service';
import * as os from 'os';
import { NotificationDeliveryState } from '../delivery-state';

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly instanceId = `${os.hostname()}-${process.pid}`;
  private readonly LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private isProcessing = false;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleOutbox() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.processEvents();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error processing outbox: ${message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvents() {
    const claimedEvents = await this.claimBatch(50);

    if (claimedEvents.length === 0) return;

    this.logger.log(
      `Claimed ${claimedEvents.length} outbox events (Worker: ${this.instanceId})`,
    );

    for (const event of claimedEvents) {
      await this.processEvent(event);
    }
  }

  private async claimBatch(limit: number): Promise<OutboxEvent[]> {
    return await this.outboxRepo.manager.transaction(
      async (transactionalEntityManager) => {
        const now = new Date();
        const lockTimeoutDate = new Date(now.getTime() - this.LOCK_TIMEOUT_MS);

        // 1. Selection query using SKIP LOCKED (Postgres-specific but common)
        const events = await transactionalEntityManager
          .createQueryBuilder(OutboxEvent, 'event')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .where(
            new Brackets((qb) => {
              qb.where('event.status = :pending', {
                pending: OutboxStatus.PENDING,
              })
                .orWhere(
                  new Brackets((sqb) => {
                    sqb
                      .where('event.status = :failed', {
                        failed: OutboxStatus.FAILED,
                      })
                      .andWhere('event.retryCount < :maxRetries', {
                        maxRetries: 5,
                      });
                  }),
                )
                .orWhere(
                  new Brackets((sqb) => {
                    sqb
                      .where('event.status = :processing', {
                        processing: OutboxStatus.PROCESSING,
                      })
                      .andWhere('event.claimedAt < :timeout', {
                        timeout: lockTimeoutDate,
                      });
                  }),
                );
            }),
          )
          .orderBy('event.createdAt', 'ASC')
          .limit(limit)
          .getMany();

        if (events.length > 0) {
          const eventIds = events.map((e) => e.id);

          // 2. Mark as processing within the same transaction to claim ownership
          await transactionalEntityManager
            .createQueryBuilder()
            .update(OutboxEvent)
            .set({
              status: OutboxStatus.PROCESSING,
              claimedBy: this.instanceId,
              claimedAt: now,
            })
            .whereInIds(eventIds)
            .execute();

          // Update objects in memory for immediately availability in the processing loop
          events.forEach((e) => {
            e.status = OutboxStatus.PROCESSING;
            e.claimedBy = this.instanceId;
            e.claimedAt = now;
          });
        }

        return events;
      },
    );
  }

  private async processEvent(event: OutboxEvent) {
    try {
      // 1. Enforce outbox event idempotency by idempotencyKey if set
      if (event.idempotencyKey) {
        const existingCompleted = await this.outboxRepo.findOne({
          where: {
            idempotencyKey: event.idempotencyKey,
            status: OutboxStatus.COMPLETED,
          },
        });

        if (existingCompleted && existingCompleted.id !== event.id) {
          this.logger.log(
            `Outbox event ${event.id} skipped (idempotencyKey '${event.idempotencyKey}' already completed by event ${existingCompleted.id})`,
          );
          event.status = OutboxStatus.COMPLETED;
          event.processedAt = new Date();
          await this.outboxRepo.save(event);
          return;
        }
      }

      // 2. Dispatch based on type
      const dispatchIdempotencyKey = event.idempotencyKey || event.id;

      switch (event.type) {
        case 'comment_notification':
        case 'message_notification':
        case 'reply_notification':
        case 'reaction_notification':
        case 'reaction_update':
        case 'report_notification': {
          const outcome = await this.notificationService.enqueueNotification(
            event.type,
            event.payload,
            dispatchIdempotencyKey,
          );
          if (outcome.state === NotificationDeliveryState.SKIPPED) {
            event.status = OutboxStatus.SKIPPED;
            event.processedAt = new Date();
            event.lastError = outcome.reason;
            await this.outboxRepo.save(event);
            return;
          }
          break;
        }
        default:
          this.logger.warn(`Unknown outbox event type: ${event.type}`);
          event.status = OutboxStatus.COMPLETED;
          event.processedAt = new Date();
          await this.outboxRepo.save(event);
          return;
      }

      // Mark as completed
      event.status = OutboxStatus.COMPLETED;
      event.processedAt = new Date();
      await this.outboxRepo.save(event);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to dispatch event ${event.id}: ${message}`);
      event.status = OutboxStatus.FAILED;
      event.retryCount += 1;
      event.lastError = message;
      // Clear claiming info so it can be picked up later if timeout expires or immediately if retry logic allows
      // Actually, standard retry logic will wait for the next cron.
      await this.outboxRepo.save(event);
    }
  }
}
