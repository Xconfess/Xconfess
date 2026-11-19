import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageDeliveryStatus } from '../entities/message.entity';

export type ThreadViewerRole = 'AUTHOR' | 'SENDER';

@Injectable()
export class MessageRepository {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  async markThreadRead(
    confessionId: string,
    senderId: string,
    role: ThreadViewerRole,
  ): Promise<void> {
    if (role === 'AUTHOR') {
      await this.messageRepository
        .createQueryBuilder()
        .update(Message)
        .set({ authorReadAt: () => 'CURRENT_TIMESTAMP' })
        .where('"confessionId" = :confessionId', { confessionId })
        .andWhere('"senderId" = :senderId', { senderId })
        .andWhere('"authorReadAt" IS NULL')
        .execute();
      return;
    }

    await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({ senderReadAt: () => 'CURRENT_TIMESTAMP' })
      .where('"confessionId" = :confessionId', { confessionId })
      .andWhere('"senderId" = :senderId', { senderId })
      .andWhere('"hasReply" = :hasReply', { hasReply: true })
      .andWhere('"senderReadAt" IS NULL')
      .execute();
  }

  /**
   * Mark messages as delivered for a specific recipient (sender-side).
   * Idempotent: only updates messages that are still in SENT state.
   */
  async markMessagesDelivered(
    confessionId: string,
    senderId: string,
  ): Promise<number> {
    const result = await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({
        deliveryStatus: MessageDeliveryStatus.DELIVERED,
        deliveredAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('"confessionId" = :confessionId', { confessionId })
      .andWhere('"senderId" = :senderId', { senderId })
      .andWhere('"deliveryStatus" = :status', { status: MessageDeliveryStatus.SENT })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Mark messages as read for a specific recipient (sender-side).
   * Idempotent: only updates messages that are not yet read.
   */
  async markMessagesRead(
    confessionId: string,
    senderId: string,
  ): Promise<number> {
    const result = await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({
        deliveryStatus: MessageDeliveryStatus.READ,
        readAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('"confessionId" = :confessionId', { confessionId })
      .andWhere('"senderId" = :senderId', { senderId })
      .andWhere('"deliveryStatus" != :readStatus', { readStatus: MessageDeliveryStatus.READ })
      .execute();
    return result.affected ?? 0;
  }
}
