import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { MessagesService } from '../src/messages/messages.service';
import { User } from '../src/user/entities/user.entity';
import { NotificationQueue } from '../src/notification/notification.queue';

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

/**
 * E2E tests for message flow ownership and reply constraints.
 *
 * These tests validate:
 * 1. Only authenticated users can send messages.
 * 2. Self-messaging (sending a message to your own confession) is forbidden.
 * 3. Only the confession author can reply to messages.
 * 4. Duplicate replies to the same message are rejected.
 * 5. Unauthorized users cannot read author-only message threads.
 *
 * NOTE: These tests use mocked services to isolate the controller logic.
 * For full integration tests, a running database is required.
 */
describe('Message Flow E2E – Ownership & Reply Constraints', () => {
  let app: INestApplication;

  // Mock users
  const authorUser: Partial<User> = {
    id: 1,
  };

  const senderUser: Partial<User> = {
    id: 2,
  };

  const outsiderUser: Partial<User> = {
    id: 3,
  };

  // Mock confession and message IDs
  const confessionId = '11111111-1111-4111-8111-111111111111';
  const messageId = 1;
  const senderAnonId = '22222222-2222-4222-8222-222222222222';

  // Mock service
  const mockMessagesService = {
    create: jest.fn(),
    reply: jest.fn(),
    findForConfessionThread: jest.fn(),
    findAllThreadsForUser: jest.fn(),
  };

  const mockNotificationQueue = {
    addNotification: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        // Dynamically import to avoid circular deps
        (await import('../src/messages/messages.controller'))
          .MessagesController,
      ],
      providers: [
        { provide: MessagesService, useValue: mockMessagesService },
        {
          provide: NotificationQueue,
          useValue: mockNotificationQueue,
        },
      ],
    })
      .overrideGuard((await import('../src/auth/jwt-auth.guard')).JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          // Simulate the auth header determining the user
          const authUser = req.headers['x-test-user'];
          if (authUser === 'author') req.user = authorUser;
          else if (authUser === 'sender') req.user = senderUser;
          else if (authUser === 'outsider') req.user = outsiderUser;
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

  // ─── Test 1: Send message to confession author ───
  describe('POST /api/messages – send message', () => {
    it('should allow authenticated user to send a message', async () => {
      mockMessagesService.create.mockResolvedValue({
        id: messageId,
        content: 'Hello author!',
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-test-user', 'sender')
        .send({ confession_id: confessionId, content: 'Hello author!' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.messageId).toBe(messageId);
      expect(mockMessagesService.create).toHaveBeenCalledTimes(1);
    });

    it('should reject message with empty content', async () => {
      await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-test-user', 'sender')
        .send({ confession_id: confessionId, content: '' })
        .expect(400);
    });

    it('should reject message without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/messages')
        .send({ confession_id: confessionId, content: 'No auth!' })
        .expect(403);
    });

    it('should reject malformed confession UUID', async () => {
      await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-test-user', 'sender')
        .send({ confession_id: 'not-a-uuid', content: 'Hello author!' })
        .expect(400);
    });
  });

  // ─── Test 2: Forbidden self-message ───
  describe('POST /api/messages – self-message guard', () => {
    it('should reject when user messages their own confession', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockMessagesService.create.mockRejectedValue(
        new ForbiddenException('Cannot message your own confession'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-test-user', 'author')
        .send({ confession_id: confessionId, content: 'Self message' })
        .expect(403);

      expect(res.body.message).toContain('Cannot message your own confession');
    });
  });

  // ─── Test 3: Author-only reply ───
  describe('POST /api/messages/reply – author-only enforcement', () => {
    it('should allow confession author to reply', async () => {
      mockMessagesService.reply.mockResolvedValue({
        id: messageId,
        hasReply: true,
        replyContent: 'Thanks for reaching out!',
        repliedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/messages/reply')
        .set('x-test-user', 'author')
        .send({ message_id: messageId, reply: 'Thanks for reaching out!' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should reject reply from non-author user', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockMessagesService.reply.mockRejectedValue(
        new ForbiddenException('You are not the author of this confession'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/messages/reply')
        .set('x-test-user', 'sender')
        .send({ message_id: messageId, reply: 'I am not the author' })
        .expect(403);

      expect(res.body.message).toContain(
        'You are not the author of this confession',
      );
    });
  });

  // ─── Test 4: Single-reply enforcement (no duplicate replies) ───
  describe('POST /api/messages/reply – duplicate reply guard', () => {
    it('should reject duplicate reply to same message', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockMessagesService.reply.mockRejectedValue(
        new ForbiddenException('Already replied'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/messages/reply')
        .set('x-test-user', 'author')
        .send({ message_id: messageId, reply: 'Duplicate reply attempt' })
        .expect(403);

      expect(res.body.message).toContain('Already replied');
    });
  });

  // ─── Test 5: Thread access control ───
  describe('GET /api/messages – thread access ownership', () => {
    it('should allow author/sender to read their thread', async () => {
      mockMessagesService.findForConfessionThread.mockResolvedValue([
        {
          id: 1,
          content: 'Hello',
          createdAt: new Date(),
          hasReply: false,
          replyContent: null,
          repliedAt: null,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/messages')
        .set('x-test-user', 'sender')
        .query({ confession_id: confessionId, sender_id: senderAnonId })
        .expect(200);

      expect(res.body.messages).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should reject outsider from reading thread', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockMessagesService.findForConfessionThread.mockRejectedValue(
        new ForbiddenException('You are not part of this conversation'),
      );

      const res = await request(app.getHttpServer())
        .get('/api/messages')
        .set('x-test-user', 'outsider')
        .query({ confession_id: confessionId, sender_id: senderAnonId })
        .expect(403);

      expect(res.body.message).toContain(
        'You are not part of this conversation',
      );
    });

    it('should reject malformed confession UUID in query', async () => {
      await request(app.getHttpServer())
        .get('/api/messages')
        .set('x-test-user', 'sender')
        .query({ confession_id: 'invalid-id', sender_id: senderAnonId })
        .expect(400);
    });
  });

  // ─── Test 7: Mixed anonymous/auth participant regression ───
  describe('GET /api/messages/threads – mixed-context ownership consistency', () => {
    it('should return normalized unread state without duplicate participant entries', async () => {
      mockMessagesService.findAllThreadsForUser.mockResolvedValue([
        {
          confessionId,
          senderId: senderAnonId,
          confessionMessage: 'Seed confession...',
          lastMessage: 'Latest sender message',
          lastMessageAt: new Date().toISOString(),
          hasUnread: true,
          unreadCount: 2,
          isAuthor: true,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/messages/threads')
        .set('x-test-user', 'author')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        confessionId,
        senderId: senderAnonId,
        hasUnread: true,
        unreadCount: 2,
        isAuthor: true,
      });
      expect(mockMessagesService.findAllThreadsForUser).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  // ─── Test 6: Reply validation ───
  describe('POST /api/messages/reply – input validation', () => {
    it('should reject empty reply content', async () => {
      await request(app.getHttpServer())
        .post('/api/messages/reply')
        .set('x-test-user', 'author')
        .send({ message_id: messageId, reply: '' })
        .expect(400);
    });

    it('should reject missing message_id', async () => {
      await request(app.getHttpServer())
        .post('/api/messages/reply')
        .set('x-test-user', 'author')
        .send({ reply: 'Missing id' })
        .expect(400);
    });
  });
});
