import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../entities/message.entity';

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
}
