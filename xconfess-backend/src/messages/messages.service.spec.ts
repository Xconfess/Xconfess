import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessagesService } from './messages.service';
import { Message } from './entities/message.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { UserAnonymousUser } from '../user/entities/user-anonymous-link.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { User } from '../user/entities/user.entity';
import { MessageRepository } from './repository/message.repository';
import { encryptMessage, generateMessageKeyPair, buildThreadId } from './crypto/message-e2e.crypto';

describe('MessagesService', () => {
  let service: MessagesService;
  let messageRepo: Repository<Message>;
  let confessionRepo: Repository<AnonymousConfession>;
  let userAnonRepo: Repository<UserAnonymousUser>;
  let anonUserService: AnonymousUserService;
  let customMessageRepository: MessageRepository;
  let dataSource: DataSource;
  let messageQueryBuilder: any;

  const mockUser: User = { id: 1 } as User;
  const mockAnonId = 'anon-123';

  const mockConfessionId = '11111111-1111-4111-8111-111111111111';
  const mockSenderId = '22222222-2222-4222-8222-222222222222';
  let encryptedReply: string;

  beforeAll(async () => {
    const sender = await generateMessageKeyPair();
    const author = await generateMessageKeyPair();
    encryptedReply = await encryptMessage(
      'Got it!',
      author.privateKey,
      sender.publicKey,
      buildThreadId(mockConfessionId, mockSenderId),
    );
  });

  beforeEach(async () => {
    messageQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: getRepositoryToken(Message),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(() => messageQueryBuilder),
            manager: {
              transaction: jest.fn(),
            },
          },
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserAnonymousUser),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
        {
          provide: AnonymousUserService,
          useValue: {
            getOrCreateForUserSession: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: {
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: MessageRepository,
          useValue: {
            markThreadRead: jest.fn(),
          },
        },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    messageRepo = module.get<Repository<Message>>(getRepositoryToken(Message));
    confessionRepo = module.get<Repository<AnonymousConfession>>(
      getRepositoryToken(AnonymousConfession),
    );
    userAnonRepo = module.get<Repository<UserAnonymousUser>>(
      getRepositoryToken(UserAnonymousUser),
    );
    anonUserService = module.get<AnonymousUserService>(AnonymousUserService);
    customMessageRepository = module.get<MessageRepository>(MessageRepository);
    dataSource = module.get<DataSource>(DataSource);
  });

  describe('create', () => {
    it('should reject plaintext content', async () => {
      await expect(
        service.create(
          { confession_id: mockConfessionId, content: 'plaintext leak' },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a malformed envelope (missing ciphertext field)', async () => {
      const malformed = JSON.stringify({ v: 1, alg: 'aes-256-gcm', iv: 'AAAAAAAAAAAAAAAA' });
      await expect(
        service.create(
          { confession_id: mockConfessionId, content: malformed },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject an envelope with an unexpected extra field', async () => {
      const tampered = JSON.stringify({
        ...JSON.parse(encryptedReply),
        extra: 'unexpected',
      });
      await expect(
        service.create(
          { confession_id: mockConfessionId, content: tampered },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should persist a valid E2E envelope', async () => {
      const confession = {
        id: mockConfessionId,
        anonymousUser: { id: mockAnonId, userLinks: [] },
      };
      jest.spyOn(confessionRepo, 'findOne').mockResolvedValue(confession as any);
      jest
        .spyOn(anonUserService, 'getOrCreateForUserSession')
        .mockResolvedValue({ id: mockSenderId } as any);

      const mockSave = jest.fn().mockImplementation((m) => Promise.resolve({ id: 1, ...m }));
      const mockManager = {
        getRepository: jest.fn((entity) =>
          entity === Message
            ? { create: jest.fn((value) => value), save: mockSave }
            : { create: jest.fn((value) => value), save: jest.fn() },
        ),
      };
      jest.spyOn(dataSource, 'transaction').mockImplementation(async (fn: any) => fn(mockManager));

      const result = await service.create(
        { confession_id: mockConfessionId, content: encryptedReply },
        mockUser,
      );

      expect(result.content).toBe(encryptedReply);
      expect(result.isEncrypted).toBe(true);
    });
  });

  describe('findForConfessionThread', () => {
    it('should return messages if user is author', async () => {
      const confession = {
        id: mockConfessionId,
        anonymousUser: { id: mockAnonId },
      };
      jest
        .spyOn(confessionRepo, 'findOne')
        .mockResolvedValue(confession as any);
      jest
        .spyOn(userAnonRepo, 'find')
        .mockResolvedValue([{ anonymousUserId: mockAnonId }] as any);

      const mockMessages = [{ id: 1, content: 'test' }];
      messageQueryBuilder.getMany.mockResolvedValue(mockMessages);

      const result = await service.findForConfessionThread(
        mockConfessionId,
        mockSenderId,
        mockUser,
      );
      expect(result.data).toEqual(mockMessages);
      expect(customMessageRepository.markThreadRead).toHaveBeenCalledWith(
        mockConfessionId,
        mockSenderId,
        'AUTHOR',
      );
      expect(messageRepo.createQueryBuilder).toHaveBeenCalledWith('message');
    });

    it('should return messages if user is sender', async () => {
      const confession = {
        id: mockConfessionId,
        anonymousUser: { id: 'other-anon' },
      };
      jest
        .spyOn(confessionRepo, 'findOne')
        .mockResolvedValue(confession as any);
      jest
        .spyOn(userAnonRepo, 'find')
        .mockResolvedValue([{ anonymousUserId: mockSenderId }] as any);

      const mockMessages = [{ id: 1, content: 'test' }];
      messageQueryBuilder.getMany.mockResolvedValue(mockMessages);

      const result = await service.findForConfessionThread(
        mockConfessionId,
        mockSenderId,
        mockUser,
      );
      expect(result.data).toEqual(mockMessages);
      expect(customMessageRepository.markThreadRead).toHaveBeenCalledWith(
        mockConfessionId,
        mockSenderId,
        'SENDER',
      );
    });

    it('should throw NotFoundException if confession does not exist', async () => {
      jest.spyOn(confessionRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.findForConfessionThread(
          mockConfessionId,
          mockSenderId,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if user is neither author nor sender', async () => {
      const confession = {
        id: mockConfessionId,
        anonymousUser: { id: 'other-anon' },
      };
      jest
        .spyOn(confessionRepo, 'findOne')
        .mockResolvedValue(confession as any);
      jest
        .spyOn(userAnonRepo, 'find')
        .mockResolvedValue([{ anonymousUserId: 'unrelated-anon' }] as any);

      await expect(
        service.findForConfessionThread(
          mockConfessionId,
          mockSenderId,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reply', () => {
    it('should allow reply when user is confession author', async () => {
      const message = {
        id: 1,
        hasReply: false,
        confession: { id: 'c1', anonymousUser: { id: mockAnonId } },
      } as any;
      jest.spyOn(messageRepo, 'findOne').mockResolvedValue(message);
      jest
        .spyOn(userAnonRepo, 'find')
        .mockResolvedValue([{ anonymousUserId: mockAnonId }] as any);
      const mockSave = jest.fn().mockImplementation((m) => Promise.resolve({ ...m }));
      const mockManager = {
        getRepository: jest.fn((entity) =>
          entity === Message
            ? { save: mockSave }
            : { create: jest.fn((value) => value), save: jest.fn() },
        ),
      };
      jest
        .spyOn(messageRepo.manager as any, 'transaction')
        .mockImplementation(async (fn: any) => fn(mockManager));

      await service.reply({ message_id: 1, reply: encryptedReply }, mockUser);
      expect(message.hasReply).toBe(true);
      expect(message.replyContent).toBe(encryptedReply);
      expect(mockSave).toHaveBeenCalledWith(message);
    });

    it('should reject plaintext reply', async () => {
      const message = {
        id: 1,
        hasReply: false,
        confession: { id: 'c1', anonymousUser: { id: mockAnonId } },
      } as any;
      jest.spyOn(messageRepo, 'findOne').mockResolvedValue(message);
      jest.spyOn(userAnonRepo, 'find').mockResolvedValue([{ anonymousUserId: mockAnonId }] as any);

      await expect(service.reply({ message_id: 1, reply: 'plaintext' }, mockUser))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user is not confession author', async () => {
      const message = {
        id: 1,
        hasReply: false,
        confession: { id: 'c1', anonymousUser: { id: 'other-anon' } },
      } as any;
      jest.spyOn(messageRepo, 'findOne').mockResolvedValue(message);
      jest
        .spyOn(userAnonRepo, 'find')
        .mockResolvedValue([{ anonymousUserId: 'unrelated-anon' }] as any);

      await expect(
        service.reply({ message_id: 1, reply: encryptedReply }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when message does not exist', async () => {
      jest.spyOn(messageRepo, 'findOne').mockResolvedValue(null);

      await expect(
        service.reply({ message_id: 999, reply: encryptedReply }, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when already replied', async () => {
      const message = {
        id: 1,
        hasReply: true,
        confession: { id: 'c1', anonymousUser: { id: mockAnonId } },
      } as any;
      jest.spyOn(messageRepo, 'findOne').mockResolvedValue(message);

      await expect(
        service.reply({ message_id: 1, reply: encryptedReply }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAllThreadsForUser', () => {
    it('should return grouped threads', async () => {
      jest
        .spyOn(userAnonRepo, 'find')
        .mockResolvedValue([{ anonymousUserId: mockAnonId }] as any);

      const mockMessages = [
        {
          confession: {
            id: 'c1',
            message: 'Confession 1',
            anonymousUser: { id: 'author1' },
          },
          sender: { id: 's1' },
          content: 'msg1',
          createdAt: new Date(),
        },
        {
          confession: {
            id: 'c1',
            message: 'Confession 1',
            anonymousUser: { id: 'author1' },
          },
          sender: { id: 's1' },
          content: 'msg2',
          createdAt: new Date(Date.now() - 1000),
        },
      ];
      messageQueryBuilder.getMany.mockResolvedValue(mockMessages as any);

      const result = await service.findAllThreadsForUser(mockUser, {} as any);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        confessionId: 'c1',
        senderId: 's1',
      });
    });
  });
});
