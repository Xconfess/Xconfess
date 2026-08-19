import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Message } from './entities/message.entity';
import { CreateMessageDto, ReplyMessageDto } from './dto/message.dto';
import { User } from '../user/entities/user.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { UserAnonymousUser } from '../user/entities/user-anonymous-link.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import {
  OutboxEvent,
  OutboxStatus,
} from '../common/entities/outbox-event.entity';
import {
  MessageRepository,
  ThreadViewerRole,
} from './repository/message.repository';
import {
  decodeCursor,
  encodeCursor,
  CursorPaginatedResponseDto,
} from '../common/pagination';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';
import {
  ENCRYPTED_PREVIEW,
  isEncryptedPayload,
} from './crypto/message-e2e.crypto';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepository: Repository<AnonymousConfession>,
    @InjectRepository(UserAnonymousUser)
    private readonly userAnonRepo: Repository<UserAnonymousUser>,
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly customMessageRepository: MessageRepository,
    private readonly anonymousUserService: AnonymousUserService,
    private readonly dataSource: DataSource,
  ) {}

  private resolveThreadViewerRole(
    confessionAuthorId: string | undefined,
    senderId: string,
    userAnonIds: string[],
  ): ThreadViewerRole | null {
    const isAuthor =
      !!confessionAuthorId && userAnonIds.includes(confessionAuthorId);
    const isSender = userAnonIds.includes(senderId);

    if (!isAuthor && !isSender) {
      return null;
    }

    // Canonical ownership model:
    // - Author view owns author-side read state
    // - Sender view owns sender-side read state
    return isAuthor ? 'AUTHOR' : 'SENDER';
  }

  async create(
    createMessageDto: CreateMessageDto,
    user: User,
  ): Promise<Message> {
    if (!isEncryptedPayload(createMessageDto.content)) {
      throw new BadRequestException(
        'Message content must be an E2E ciphertext envelope',
      );
    }

    const confession = await this.confessionRepository.findOne({
      where: { id: createMessageDto.confession_id },
      relations: [
        'anonymousUser',
        'anonymousUser.userLinks',
        'anonymousUser.userLinks.user',
      ],
    });
    if (!confession) throw new NotFoundException('Confession not found');

    const authorUser = confession.anonymousUser?.userLinks?.[0]?.user;
    if (authorUser && !authorUser.canReceiveReplies()) {
      throw new ForbiddenException('This user is not accepting messages');
    }

    // Get or create anonymous identity for this session
    const sender = await this.anonymousUserService.getOrCreateForUserSession(
      user.id,
    );

    return this.dataSource.transaction(async (manager) => {
      const messageRepo = manager.getRepository(Message);
      const outboxRepo = manager.getRepository(OutboxEvent);

      const message = messageRepo.create({
        sender,
        confession,
        content: createMessageDto.content,
        isEncrypted: true,
      });

      const savedMessage = await messageRepo.save(message);

      // Create Outbox Event for notification to confession author
      const recipientEmail = this.getRecipientEmail(confession.anonymousUser);
      if (recipientEmail) {
        await outboxRepo.save(
          outboxRepo.create({
            type: 'message_notification',
            payload: {
              messageId: savedMessage.id,
              confessionId: confession.id,
              recipientEmail,
              senderId: sender.id,
              messagePreview: ENCRYPTED_PREVIEW,
            },
            idempotencyKey: `message:${savedMessage.id}`,
            status: OutboxStatus.PENDING,
          }),
        );
      }

      return savedMessage;
    });
  }

  async findForConfessionThread(
    confessionId: string,
    senderId: string,
    user: User,
    query?: GetMessagesQueryDto,
  ): Promise<CursorPaginatedResponseDto<Message>> {
    if (!confessionId || confessionId.trim() === '') {
      throw new BadRequestException('Invalid confession ID');
    }
    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
      relations: ['anonymousUser'],
    });
    if (!confession) throw new NotFoundException('Thread not found');

    const userAnons = await this.userAnonRepo.find({
      where: { userId: user.id },
    });
    const anonIds = userAnons.map((ua) => ua.anonymousUserId);

    const viewerRole = this.resolveThreadViewerRole(
      confession.anonymousUser?.id,
      senderId,
      anonIds,
    );
    if (!viewerRole) {
      throw new NotFoundException('Thread not found');
    }

    await this.customMessageRepository.markThreadRead(
      confessionId,
      senderId,
      viewerRole,
    );

    const limit = query?.limit || 20;

    const qb = this.messageRepository
      .createQueryBuilder('message')
      .where('message.confessionId = :confessionId', { confessionId })
      .andWhere('message.senderId = :senderId', { senderId });

    if (query?.cursor) {
      const parsedCursor = decodeCursor<{ id: number; createdAt: string }>(
        query.cursor,
      );
      if (parsedCursor) {
        qb.andWhere(
          'message.createdAt > :cursorDate OR (message.createdAt = :cursorDate AND message.id > :cursorId)',
          {
            cursorDate: parsedCursor.createdAt,
            cursorId: parsedCursor.id,
          },
        );
      }
    } else if (query?.page && query.page > 1) {
      qb.skip((query.page - 1) * limit);
    }

    const messages = await qb
      .orderBy('message.createdAt', 'ASC')
      .take(limit + 1)
      .getMany();

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;

    let nextCursor: string | null = null;
    if (hasMore && resultMessages.length > 0) {
      const lastMessage = resultMessages[resultMessages.length - 1];
      nextCursor = encodeCursor({
        id: lastMessage.id,
        createdAt: lastMessage.createdAt.toISOString(),
      });
    }

    return new CursorPaginatedResponseDto(
      resultMessages,
      nextCursor,
      hasMore,
      limit,
    );
  }

  async findAllThreadsForUser(
    user: User,
    query: GetMessagesQueryDto,
  ): Promise<CursorPaginatedResponseDto<any>> {
    const userAnons = await this.userAnonRepo.find({
      where: { userId: user.id },
    });
    const anonIds = userAnons.map((ua) => ua.anonymousUserId);

    if (anonIds.length === 0) {
      return new CursorPaginatedResponseDto([], null, false, query.limit || 20);
    }

    const qb = this.messageRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.confession', 'confession')
      .leftJoinAndSelect('m.sender', 'sender')
      .leftJoinAndSelect('confession.anonymousUser', 'confessionAuthor')
      .where([
        { sender: { id: In(anonIds) } },
        { confession: { anonymousUser: { id: In(anonIds) } } },
      ]);

    if (query.cursor) {
      const parsedCursor = decodeCursor<{ id: string; lastMessageAt: string }>(
        query.cursor,
      );
      if (parsedCursor) {
        qb.andWhere('m.createdAt < :cursorDate', {
          cursorDate: parsedCursor.lastMessageAt,
        });
      }
    } else if (query.page && query.page > 1) {
      // Offset pagination for threads is hard with this in-memory grouping,
      // but we can try to limit the message fetch.
      // For now, only cursor pagination is truly supported for threads.
    }

    // We fetch a larger pool of messages to ensure we get enough threads
    // This is still a bit of a hack until a proper Thread entity exists.
    const messageLimit = (query.limit || 20) * 10;
    const messages = await qb
      .orderBy('m.createdAt', 'DESC')
      .take(messageLimit)
      .getMany();

    const threadsMap = new Map();

    messages.forEach((m) => {
      const threadId = `${m.confession.id}_${m.sender.id}`;
      if (!threadsMap.has(threadId)) {
        const role = this.resolveThreadViewerRole(
          m.confession.anonymousUser?.id,
          m.sender.id,
          anonIds,
        );
        const hasUnreadForRole =
          role === 'AUTHOR'
            ? !m.authorReadAt
            : role === 'SENDER'
              ? !!m.hasReply && !m.senderReadAt
              : false;

        threadsMap.set(threadId, {
          confessionId: m.confession.id,
          senderId: m.sender.id,
          authorAnonymousUserId: m.confession.anonymousUser?.id ?? null,
          confessionMessage:
            m.confession.message.substring(0, 50) +
            (m.confession.message.length > 50 ? '...' : ''),
          lastMessage: m.isEncrypted ? ENCRYPTED_PREVIEW : m.content,
          lastMessageEncrypted: m.isEncrypted,
          lastMessageAt: m.createdAt,
          hasUnread: hasUnreadForRole,
          unreadCount: hasUnreadForRole ? 1 : 0,
          isAuthor: role === 'AUTHOR',
        });
      } else {
        const existing = threadsMap.get(threadId);
        const role = this.resolveThreadViewerRole(
          m.confession.anonymousUser?.id,
          m.sender.id,
          anonIds,
        );
        const messageUnread =
          role === 'AUTHOR'
            ? !m.authorReadAt
            : role === 'SENDER'
              ? !!m.hasReply && !m.senderReadAt
              : false;
        if (messageUnread) {
          existing.hasUnread = true;
          existing.unreadCount += 1;
        }
      }
    });

    const allThreads = Array.from(threadsMap.values());
    const limit = query.limit || 20;
    const hasMore = allThreads.length > limit;
    const resultThreads = hasMore ? allThreads.slice(0, limit) : allThreads;

    let nextCursor: string | null = null;
    if (hasMore && resultThreads.length > 0) {
      const lastThread = resultThreads[resultThreads.length - 1];
      nextCursor = encodeCursor({
        id: `${lastThread.confessionId}_${lastThread.senderId}`,
        lastMessageAt: lastThread.lastMessageAt.toISOString(),
      });
    }

    return new CursorPaginatedResponseDto(
      resultThreads,
      nextCursor,
      hasMore,
      limit,
    );
  }

  async reply(dto: ReplyMessageDto, user: User): Promise<Message> {
    // Validate reply content
    if (!dto.reply || dto.reply.trim() === '') {
      throw new BadRequestException('Reply content cannot be empty');
    }
    if (!isEncryptedPayload(dto.reply)) {
      throw new BadRequestException(
        'Reply content must be an E2E ciphertext envelope',
      );
    }
    const message = await this.messageRepository.findOne({
      where: { id: dto.message_id },
      relations: [
        'confession',
        'confession.anonymousUser',
        'sender',
        'sender.userLinks',
        'sender.userLinks.user',
      ],
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.hasReply) throw new ForbiddenException('Already replied');

    // Verify user is author of the confession
    const userAnons = await this.userAnonRepo.find({
      where: { userId: user.id },
    });
    const anonIds = userAnons.map((ua) => ua.anonymousUserId);
    const confessionAuthorId = message.confession?.anonymousUser?.id;
    if (!confessionAuthorId || !anonIds.includes(confessionAuthorId)) {
      throw new ForbiddenException('You are not the author of this confession');
    }

    // Use a transaction to ensure atomicity
    return this.messageRepository.manager.transaction(async (manager) => {
      const messageRepo = manager.getRepository(Message);
      const outboxRepo = manager.getRepository(OutboxEvent);

      message.hasReply = true;
      message.replyContent = dto.reply.trim();
      message.isEncrypted = true;
      message.repliedAt = new Date();
      const savedReply = await messageRepo.save(message);

      // Create Outbox Event for notification to the original sender
      const recipientEmail = this.getRecipientEmail(message.sender);
      if (recipientEmail) {
        await outboxRepo.save(
          outboxRepo.create({
            type: 'reply_notification',
            payload: {
              messageId: savedReply.id,
              confessionId: message.confession.id,
              recipientEmail,
              replyPreview: ENCRYPTED_PREVIEW,
            },
            idempotencyKey: `reply:${savedReply.id}`,
            status: OutboxStatus.PENDING,
          }),
        );
      }

      return savedReply;
    });
  }

  private getRecipientEmail(anonymousUser: AnonymousUser): string | null {
    if (!anonymousUser) return null;
    const link = anonymousUser.userLinks?.[0];
    if (link?.user) {
      return link.user.getEmail();
    }
    return null;
  }

  /**
   * Get inbox (list of threads) for a user.
   * Delegates to findAllThreadsForUser which uses anon ID filtering
   * to ensure users can only see their own threads.
   */
  async getInbox(userId: number, query?: GetMessagesQueryDto): Promise<CursorPaginatedResponseDto<any>> {
    const user = { id: userId } as User;
    return this.findAllThreadsForUser(user, query || {});
  }

  /**
   * Get a specific thread with participant verification.
   * A user can only view a thread if they are either the confession author
   * or the message sender (through their anonymous identities).
   * Returns NotFound (not Forbidden) to avoid revealing thread existence.
   */
  async getThreadWithParticipantCheck(
    threadId: string,
    userId: number,
  ): Promise<any> {
    const [confessionId, senderId] = threadId.split('_');
    if (!confessionId || !senderId) {
      throw new NotFoundException('Thread not found');
    }

    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
      relations: ['anonymousUser'],
    });
    if (!confession) throw new NotFoundException('Thread not found');

    const userAnons = await this.userAnonRepo.find({
      where: { userId },
    });
    const anonIds = userAnons.map((ua) => ua.anonymousUserId);

    const viewerRole = this.resolveThreadViewerRole(
      confession.anonymousUser?.id,
      senderId,
      anonIds,
    );

    if (!viewerRole) {
      throw new NotFoundException('Thread not found');
    }

    const user = { id: userId } as User;
    return this.findForConfessionThread(confessionId, senderId, user);
  }

  /**
   * Delete (hide) a thread for a user without deleting the underlying messages.
   * Only the thread participant can hide it from their view.
   * Returns NotFound to avoid revealing thread existence to non-participants.
   */
  async deleteForUser(userId: number, threadId: string): Promise<{ success: boolean }> {
    const [confessionId, senderId] = threadId.split('_');
    if (!confessionId || !senderId) {
      throw new NotFoundException('Thread not found');
    }

    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
      relations: ['anonymousUser'],
    });
    if (!confession) throw new NotFoundException('Thread not found');

    const userAnons = await this.userAnonRepo.find({
      where: { userId },
    });
    const anonIds = userAnons.map((ua) => ua.anonymousUserId);

    const viewerRole = this.resolveThreadViewerRole(
      confession.anonymousUser?.id,
      senderId,
      anonIds,
    );

    if (!viewerRole) {
      throw new NotFoundException('Thread not found');
    }

    // Soft-delete: mark thread as hidden for this participant role
    const user = { id: userId } as User;
    await this.customMessageRepository.markThreadRead(
      confessionId,
      senderId,
      viewerRole,
    );

    return { success: true };
  }

  /**
   * Verify a user can access a thread by anon identity.
   * Returns NotFound (never Forbidden) to avoid revealing thread existence.
   */
  private async verifyThreadParticipant(
    confessionId: string,
    senderId: string,
    userId: number,
  ): Promise<ThreadViewerRole> {
    const confession = await this.confessionRepository.findOne({
      where: { id: confessionId },
      relations: ['anonymousUser'],
    });
    if (!confession) throw new NotFoundException('Thread not found');

    const userAnons = await this.userAnonRepo.find({
      where: { userId },
    });
    const anonIds = userAnons.map((ua) => ua.anonymousUserId);

    const viewerRole = this.resolveThreadViewerRole(
      confession.anonymousUser?.id,
      senderId,
      anonIds,
    );

    if (!viewerRole) {
      throw new NotFoundException('Thread not found');
    }

    return viewerRole;
  }
}
