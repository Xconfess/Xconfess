import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

/**
 * Authorization matrix for private message threads.
 *
 * Every caller who is not a participant — whether the thread is missing or the
 * caller simply lacks access — must receive the *same* 404 response. This keeps
 * the API from leaking whether a private resource exists.
 */
describe('MessagesService authorization matrix', () => {
  const CONFESSION_ID = '11111111-1111-4111-8111-111111111111';
  const SENDER_ID = '22222222-2222-4222-8222-222222222222';
  const AUTHOR_ANON_ID = '33333333-3333-4333-8333-333333333333';
  const OUTSIDER_ANON_ID = '44444444-4444-4444-8444-444444444444';
  const THREAD_ID = `${CONFESSION_ID}_${SENDER_ID}`;

  const USERS = {
    author: { id: 1, anonId: AUTHOR_ANON_ID },
    sender: { id: 2, anonId: SENDER_ID },
    outsider: { id: 3, anonId: OUTSIDER_ANON_ID },
  } as const;

  type Caller = keyof typeof USERS;

  let service: MessagesService;
  let messageRepo: any;
  let confessionRepo: any;
  let userAnonRepo: any;
  let customMessageRepository: any;

  const buildService = (confessionExists = true) => {
    messageRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
      manager: { transaction: jest.fn() },
    };

    confessionRepo = {
      findOne: jest.fn().mockResolvedValue(
        confessionExists
          ? {
              id: CONFESSION_ID,
              anonymousUser: { id: AUTHOR_ANON_ID },
            }
          : null,
      ),
    };

    userAnonRepo = {
      // Resolve the caller's anonymous id from their user id, mirroring the
      // `UserAnonymousUser` lookup used by the service.
      find: jest.fn(async ({ where }: any) => {
        const anonId = Object.values(USERS).find(
          (user) => user.id === where.userId,
        )?.anonId;
        return anonId ? [{ anonymousUserId: anonId }] : [];
      }),
    };

    customMessageRepository = {
      markThreadRead: jest.fn().mockResolvedValue(undefined),
      markMessagesDelivered: jest.fn().mockResolvedValue(undefined),
      markMessagesRead: jest.fn().mockResolvedValue(2),
    };

    return new MessagesService(
      messageRepo,
      confessionRepo,
      userAnonRepo,
      { create: jest.fn(), save: jest.fn() } as any,
      customMessageRepository,
      {} as any,
      {} as any,
      undefined,
    );
  };

  const expectIndistinguishableNotFound = async (
    action: () => Promise<unknown>,
  ) => {
    let error: any;
    try {
      await action();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getStatus()).toBe(404);
    expect(error.message).toBe('Thread not found');
  };

  beforeEach(() => {
    service = buildService();
  });

  describe('GET /messages/thread/:threadId', () => {
    const primeThreadRows = () => {
      messageRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            confessionId: CONFESSION_ID,
            senderId: SENDER_ID,
            content: 'hello',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      });
    };

    it.each(['author', 'sender'] as Caller[])(
      'allows the %s participant to read the thread',
      async (caller) => {
        primeThreadRows();

        const result = await service.getThreadWithParticipantCheck(
          THREAD_ID,
          USERS[caller].id,
        );

        expect(result.data).toHaveLength(1);
      },
    );

    it('returns the same 404 for an outsider as for a missing thread', async () => {
      primeThreadRows();

      let outsiderError: any;
      try {
        await service.getThreadWithParticipantCheck(
          THREAD_ID,
          USERS.outsider.id,
        );
      } catch (caught) {
        outsiderError = caught;
      }

      const missing = buildService(false);
      let missingError: any;
      try {
        await missing.getThreadWithParticipantCheck(
          THREAD_ID,
          USERS.outsider.id,
        );
      } catch (caught) {
        missingError = caught;
      }

      expect(outsiderError).toBeInstanceOf(NotFoundException);
      expect(outsiderError.getStatus()).toBe(404);
      expect(missingError.getStatus()).toBe(404);
      expect(outsiderError.message).toBe(missingError.message);
      expect(outsiderError.message).toBe('Thread not found');
    });
  });

  describe('PUT /messages/:userId/thread/:threadId/read', () => {
    it('allows the sender to mark the thread as read', async () => {
      await expect(
        service.markMessagesAsRead(
          CONFESSION_ID,
          SENDER_ID,
          USERS.sender.id,
        ),
      ).resolves.toEqual({ success: true, updatedCount: 2 });
    });

    it.each(['author', 'outsider'] as Caller[])(
      'returns the same 404 for the %s as for an unknown thread',
      async (caller) => {
        await expectIndistinguishableNotFound(() =>
          service.markMessagesAsRead(
            CONFESSION_ID,
            SENDER_ID,
            USERS[caller].id,
          ),
        );
      },
    );

    it('returns the same 404 for an unknown thread', async () => {
      const missing = buildService(false);
      await expectIndistinguishableNotFound(() =>
        missing.markMessagesAsRead(CONFESSION_ID, SENDER_ID, USERS.author.id),
      );
    });
  });

  describe('DELETE /messages/:userId/thread/:threadId', () => {
    it.each(['author', 'sender'] as Caller[])(
      'allows a %s participant to hide the thread',
      async (caller) => {
        await expect(
          service.deleteForUser(USERS[caller].id, THREAD_ID),
        ).resolves.toEqual({ success: true });
      },
    );

    it('returns the same 404 for non-participants and unknown threads', async () => {
      await expectIndistinguishableNotFound(() =>
        service.deleteForUser(USERS.outsider.id, THREAD_ID),
      );

      const missing = buildService(false);
      await expectIndistinguishableNotFound(() =>
        missing.deleteForUser(USERS.outsider.id, THREAD_ID),
      );
    });
  });

  describe('POST /messages/reply', () => {
    const encryptedReply =
      '{"v":1,"alg":"aes-256-gcm","iv":"AAAAAAAAAAAAAAAA","ct":"AAAAAAAAAAAAAAAAAAAAAA"}';

    const primeMessageLookup = (caller: Caller) => {
      messageRepo.findOne.mockResolvedValue({
        id: 1,
        hasReply: false,
        confession: {
          id: CONFESSION_ID,
          anonymousUser: { id: AUTHOR_ANON_ID },
        },
      });
      userAnonRepo.find.mockResolvedValue([
        { anonymousUserId: USERS[caller].anonId },
      ]);
    };

    it('returns 404 (not 403) when a non-author replies', async () => {
      primeMessageLookup('sender');

      let error: any;
      try {
        await service.reply(
          { message_id: 1, reply: encryptedReply } as any,
          { id: USERS.sender.id } as any,
        );
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.message).toBe('Message not found');
    });

    it('returns the same 404 when the message does not exist', async () => {
      messageRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reply(
          { message_id: 1, reply: encryptedReply } as any,
          { id: USERS.sender.id } as any,
        ),
      ).rejects.toHaveProperty('message', 'Message not found');
    });
  });
});
