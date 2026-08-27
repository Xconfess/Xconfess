import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { MessagesService } from '../src/messages/messages.service';
import { MessageKeysService } from '../src/messages/message-keys.service';
import { User } from '../src/user/entities/user.entity';
import { NotificationQueue } from '../src/notification/notification.queue';
import {
  buildThreadId,
  encryptMessage,
  generateMessageKeyPair,
} from '../src/messages/crypto/message-e2e.crypto';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

describe('Message E2E Key Exchange Flow', () => {
  let app: INestApplication;
  let senderKeys: Awaited<ReturnType<typeof generateMessageKeyPair>>;
  let authorKeys: Awaited<ReturnType<typeof generateMessageKeyPair>>;

  const authorUser: Partial<User> = { id: 1 };
  const senderUser: Partial<User> = { id: 2 };

  const confessionId = '11111111-1111-4111-8111-111111111111';
  const senderAnonId = '22222222-2222-4222-8222-222222222222';
  const authorAnonId = '33333333-3333-4333-8333-333333333333';
  const threadId = buildThreadId(confessionId, senderAnonId);

  const mockMessagesService = {
    create: jest.fn(),
    reply: jest.fn(),
    findForConfessionThread: jest.fn(),
    findAllThreadsForUser: jest.fn(),
  };

  const mockMessageKeysService = {
    registerForSession: jest.fn(),
    getMySessionKey: jest.fn(),
    getPublicKey: jest.fn(),
    getKeyBackup: jest.fn(),
  };

  const mockNotificationQueue = {
    addNotification: jest.fn(),
  };

  beforeAll(async () => {
    senderKeys = await generateMessageKeyPair();
    authorKeys = await generateMessageKeyPair();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        (await import('../src/messages/messages.controller')).MessagesController,
      ],
      providers: [
        { provide: MessagesService, useValue: mockMessagesService },
        { provide: MessageKeysService, useValue: mockMessageKeysService },
        { provide: NotificationQueue, useValue: mockNotificationQueue },
      ],
    })
      .overrideGuard((await import('../src/auth/jwt-auth.guard')).JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          const authUser = req.headers['x-test-user'];
          if (authUser === 'author') req.user = authorUser;
          else if (authUser === 'sender') req.user = senderUser;
          else return false;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Key registration and fetch', () => {
    it('registers sender public key', async () => {
      mockMessageKeysService.registerForSession.mockResolvedValue({
        anonymousUserId: senderAnonId,
        keyVersion: 0,
      });

      const res = await request(app.getHttpServer())
        .put('/api/messages/keys')
        .set('x-test-user', 'sender')
        .send({ publicKey: senderKeys.publicKey })
        .expect(200);

      expect(res.body.anonymousUserId).toBe(senderAnonId);
      expect(mockMessageKeysService.registerForSession).toHaveBeenCalled();
    });

    it('fetches peer public key before first message', async () => {
      mockMessageKeysService.getPublicKey.mockResolvedValue({
        anonymousUserId: authorAnonId,
        publicKey: authorKeys.publicKey,
        keyVersion: 0,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/messages/keys/${authorAnonId}`)
        .set('x-test-user', 'sender')
        .expect(200);

      expect(res.body.publicKey).toBe(authorKeys.publicKey);
    });
  });

  describe('Encrypted message send', () => {
    it('accepts E2E ciphertext envelope', async () => {
      const ciphertext = await encryptMessage(
        'Encrypted hello',
        senderKeys.privateKey,
        authorKeys.publicKey,
        threadId,
      );

      mockMessagesService.create.mockResolvedValue({
        id: 1,
        content: ciphertext,
        isEncrypted: true,
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-test-user', 'sender')
        .send({ confession_id: confessionId, content: ciphertext })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(mockMessagesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ content: ciphertext }),
        senderUser,
      );
    });

    it('rejects plaintext content', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      mockMessagesService.create.mockRejectedValue(
        new BadRequestException('Message content must be an E2E ciphertext envelope'),
      );

      await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-test-user', 'sender')
        .send({ confession_id: confessionId, content: 'plaintext leak' })
        .expect(400);
    });
  });

  describe('Encrypted reply', () => {
    it('accepts encrypted reply from author', async () => {
      const replyCipher = await encryptMessage(
        'Encrypted reply',
        authorKeys.privateKey,
        senderKeys.publicKey,
        threadId,
      );

      mockMessagesService.reply.mockResolvedValue({
        id: 1,
        hasReply: true,
        replyContent: replyCipher,
        isEncrypted: true,
        repliedAt: new Date(),
      });

      await request(app.getHttpServer())
        .post('/api/messages/reply')
        .set('x-test-user', 'author')
        .send({ message_id: 1, reply: replyCipher })
        .expect(201);
    });
  });
});
