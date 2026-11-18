import { NotificationGateway } from '../notifications/gateways/notification.gateway';
import { ReactionsGateway } from '../reaction/reactions.gateway';
import { AdminGateway } from '../admin/realtime/admin.gateway';
import { UserRole } from '../user/entities/user.entity';
import { scrubPii, WsAuthFailureReason } from '../auth/ws-auth-telemetry';
import { ENCRYPTED_PREVIEW } from '../messages/crypto/message-e2e.crypto';

describe('WebSocket Event Contracts & Authorization Invariants (#2228)', () => {
  const createMockSocket = (overrides: Record<string, unknown> = {}) => {
    const socket = {
      id: 'socket-test-1',
      data: {},
      handshake: {
        auth: {},
        headers: {},
        address: '127.0.0.1',
      },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      ...overrides,
    };
    return socket as any;
  };

  const createMockWsLogger = () => ({
    logSubscriptionRejected: jest.fn(),
    logSubscriptionGranted: jest.fn(),
    logEvent: jest.fn(),
    logConnection: jest.fn(),
    logDisconnection: jest.fn(),
  });

  describe('Notification Gateway Contracts (/notifications)', () => {
    let gateway: NotificationGateway;
    let wsLogger: ReturnType<typeof createMockWsLogger>;

    beforeEach(() => {
      wsLogger = createMockWsLogger();
      const notificationService: any = {
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        getUserNotifications: jest.fn().mockResolvedValue({
          notifications: [],
          total: 0,
          unreadCount: 0,
        }),
        shouldDeliverRealtime: jest.fn().mockResolvedValue(true),
      };
      const configService: any = {
        get: jest.fn().mockReturnValue('http://localhost:3000'),
      };
      const jwtService: any = { verifyAsync: jest.fn() };

      gateway = new NotificationGateway(
        notificationService,
        configService,
        jwtService,
        wsLogger as any,
      );
    });

    it('enforces that clients can only subscribe to their own user notification room', () => {
      const client = createMockSocket({
        data: { userId: '1001' },
      });

      // Attempt to subscribe to another user's room
      gateway.handleSubscribeUserNotifications(client, { userId: '1002' });

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'subscription:rejected',
        expect.objectContaining({
          channel: 'user:1002',
          reason: 'You can only subscribe to your own notification channel',
          timestamp: expect.any(String),
        }),
      );
      expect(wsLogger.logSubscriptionRejected).toHaveBeenCalledWith(
        expect.objectContaining({
          socketId: client.id,
          userId: '1001',
          channel: 'user:1002',
        }),
      );
    });

    it('allows client to subscribe to their own user notification room', () => {
      const client = createMockSocket({
        data: { userId: '1001' },
      });

      gateway.handleSubscribeUserNotifications(client, { userId: '1001' });

      expect(client.join).toHaveBeenCalledWith('user:1001');
      expect(client.emit).toHaveBeenCalledWith(
        'subscription:confirmed',
        expect.objectContaining({
          channel: 'user:1001',
          timestamp: expect.any(String),
        }),
      );
      expect(wsLogger.logSubscriptionGranted).toHaveBeenCalledWith(
        expect.objectContaining({
          socketId: client.id,
          userId: '1001',
          channel: 'user:1001',
        }),
      );
    });

    it('emits subscription:cancelled when client unsubscribes', async () => {
      const client = createMockSocket({
        data: { userId: '1001' },
      });

      await gateway.handleUnsubscribeUserNotifications(client);

      expect(client.leave).toHaveBeenCalledWith('user:1001');
      expect(client.emit).toHaveBeenCalledWith(
        'subscription:cancelled',
        expect.objectContaining({
          channel: 'user:1001',
          timestamp: expect.any(String),
        }),
      );
    });

    it('sendNotificationToUser delivers to isolated user room with constant preview for messages', async () => {
      const mockRoom = { emit: jest.fn() };
      (gateway as any).server = {
        to: jest.fn().mockReturnValue(mockRoom),
      };

      const notificationPayload = {
        id: 'notif-123',
        type: 'NEW_MESSAGE',
        title: 'New Message',
        message: ENCRYPTED_PREVIEW,
      };

      await gateway.sendNotificationToUser('1001', notificationPayload);

      expect((gateway as any).server.to).toHaveBeenCalledWith('user:1001');
      expect(mockRoom.emit).toHaveBeenCalledWith('new-notification', notificationPayload);
      expect(mockRoom.emit).toHaveBeenCalledWith(
        'unread-count',
        expect.objectContaining({ count: expect.any(Number) }),
      );
    });
  });

  describe('Reactions Gateway Contracts (/reactions)', () => {
    let gateway: ReactionsGateway;

    beforeEach(() => {
      const configService: any = {
        get: jest.fn().mockReturnValue('http://localhost:3000'),
      };
      const wsLogger: any = createMockWsLogger();
      gateway = new ReactionsGateway(undefined, configService, wsLogger);
    });

    it('joins confession room on valid subscribe:confession', () => {
      const client = createMockSocket({
        data: { userId: '1001' },
      });

      gateway.handleSubscribeToConfession(client, {
        confessionId: 'confession-uuid-999',
      });

      expect(client.join).toHaveBeenCalledWith('confession:confession-uuid-999');
      expect(client.emit).toHaveBeenCalledWith(
        'subscribed',
        expect.objectContaining({
          confessionId: 'confession-uuid-999',
          message: expect.stringContaining('confession-uuid-999'),
        }),
      );
    });

    it('rejects subscription when confessionId is empty or non-string', () => {
      const client = createMockSocket();

      gateway.handleSubscribeToConfession(client, { confessionId: '' });

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Confession ID is required',
      });
    });

    it('leaves confession room on unsubscribe:confession', () => {
      const client = createMockSocket();

      gateway.handleUnsubscribeFromConfession(client, {
        confessionId: 'confession-uuid-999',
      });

      expect(client.leave).toHaveBeenCalledWith('confession:confession-uuid-999');
      expect(client.emit).toHaveBeenCalledWith(
        'unsubscribed',
        expect.objectContaining({
          confessionId: 'confession-uuid-999',
        }),
      );
    });

    it('broadcastReactionAdded emits payload matching schema to target confession room only', () => {
      const mockRoom = { emit: jest.fn() };
      (gateway as any).server = {
        to: jest.fn().mockReturnValue(mockRoom),
      };

      const reactionPayload = {
        reactionId: 'react-1',
        userId: '1001',
        reactionType: 'FIRE',
        timestamp: new Date('2026-10-19T12:00:00Z'),
        totalCount: 15,
      };

      gateway.broadcastReactionAdded('confession-uuid-999', reactionPayload);

      expect((gateway as any).server.to).toHaveBeenCalledWith('confession:confession-uuid-999');
      expect(mockRoom.emit).toHaveBeenCalledWith('reaction:added', {
        confessionId: 'confession-uuid-999',
        ...reactionPayload,
      });
    });
  });

  describe('Admin Gateway Contracts (/admin)', () => {
    let gateway: AdminGateway;
    let wsLogger: ReturnType<typeof createMockWsLogger>;

    beforeEach(() => {
      wsLogger = createMockWsLogger();
      const jwtService: any = {
        verify: jest.fn(),
      };
      const userService: any = {
        findById: jest.fn(),
      };
      const configService: any = {
        get: jest.fn().mockReturnValue('http://localhost:3000'),
      };

      gateway = new AdminGateway(
        jwtService,
        userService,
        wsLogger as any,
        configService,
      );
    });

    it('rejects connection if user role is not ADMIN', async () => {
      (gateway as any).jwtService.verify.mockReturnValue({ sub: '2001' });
      (gateway as any).userService.findById.mockResolvedValue({
        id: 2001,
        role: UserRole.USER, // Regular user, not admin
      });

      const client = createMockSocket({
        handshake: {
          auth: { token: 'valid-user-token' },
          headers: {},
        },
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      expect(wsLogger.logSubscriptionRejected).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 2001,
          channel: 'admin:events',
          reason: expect.stringContaining('Insufficient role'),
        }),
      );
    });

    it('allows connection and auto-joins admin:events if user role is ADMIN', async () => {
      (gateway as any).jwtService.verify.mockReturnValue({ sub: '1001' });
      (gateway as any).userService.findById.mockResolvedValue({
        id: 1001,
        role: UserRole.ADMIN,
      });

      const client = createMockSocket({
        handshake: {
          auth: { token: 'valid-admin-token' },
          headers: {},
        },
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith('admin:events');
      expect(wsLogger.logSubscriptionGranted).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1001,
          channel: 'admin:events',
        }),
      );
    });

    it('emitNewReport fans out exclusively to admin:events room', () => {
      const mockRoom = { emit: jest.fn() };
      (gateway as any).server = {
        to: jest.fn().mockReturnValue(mockRoom),
      };

      const reportPayload = {
        id: 'report-1',
        confessionId: 'conf-123',
        reason: 'SPAM',
        status: 'PENDING',
      };

      gateway.emitNewReport(reportPayload);

      expect((gateway as any).server.to).toHaveBeenCalledWith('admin:events');
      expect(mockRoom.emit).toHaveBeenCalledWith('new-report', reportPayload);
    });
  });

  describe('WebSocket Auth Telemetry & PII Scrubbing', () => {
    it('scrubPii removes sensitive auth and token fields from telemetry payloads', () => {
      const dirtyObject = {
        socketId: 'sock-1',
        channel: '/notifications',
        token: 'secret-bearer-jwt',
        authorization: 'Bearer secret-bearer-jwt',
        cookie: 'session=secret-session-cookie',
        password: 'admin-password',
        secret: 'stellar-secret',
        email: 'user@example.com',
        safeMeta: 'connection_established',
      };

      const cleaned = scrubPii(dirtyObject);

      expect(cleaned).toEqual({
        socketId: 'sock-1',
        channel: '/notifications',
        safeMeta: 'connection_established',
      });
      expect(cleaned.token).toBeUndefined();
      expect(cleaned.authorization).toBeUndefined();
      expect(cleaned.cookie).toBeUndefined();
      expect(cleaned.email).toBeUndefined();
    });

    it('provides standard reason codes without sensitive data', () => {
      expect(WsAuthFailureReason.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
      expect(WsAuthFailureReason.TOKEN_MISSING).toBe('TOKEN_MISSING');
      expect(WsAuthFailureReason.TOKEN_MALFORMED).toBe('TOKEN_MALFORMED');
      expect(WsAuthFailureReason.TOKEN_INVALID_SIGNATURE).toBe('TOKEN_INVALID_SIGNATURE');
    });
  });
});
