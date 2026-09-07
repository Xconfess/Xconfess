import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../auth/guards/ws-jwt.guard';
import { WebSocketLogger } from '../../websocket/websocket.logger';
import { buildWebSocketServerOptions } from '../../websocket/websocket.adapter';
import { NotificationGateway } from './notification.gateway';

describe('Notification websocket auth regression coverage', () => {
  const createSocket = (
    overrides: Partial<Socket> & { data?: Record<string, unknown> } = {},
  ) =>
    ({
      id: 'socket-1',
      data: {},
      handshake: {
        auth: {},
        headers: {},
      },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      ...overrides,
    }) as unknown as Socket;

  const createWsContext = (client: Socket): ExecutionContext =>
    ({
      switchToWs: () => ({
        getClient: () => client,
      }),
    }) as unknown as ExecutionContext;

  const createGuard = (
    jwtService: Pick<JwtService, 'verifyAsync'>,
    userService?: { findById: jest.Mock },
  ) => new WsJwtGuard(jwtService as JwtService, userService as any);

  const createGateway = () => {
    const notificationService = {
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getUserNotifications: jest.fn().mockResolvedValue({
        notifications: [],
        total: 0,
        unreadCount: 0,
      }),
      shouldDeliverRealtime: jest.fn().mockResolvedValue(true),
    };
    const configService = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };
    const wsLogger = {
      logSubscriptionRejected: jest.fn(),
      logSubscriptionGranted: jest.fn(),
    };

    return {
      gateway: new NotificationGateway(
        notificationService as any,
        configService as any,
        { verifyAsync: jest.fn() } as any,
        wsLogger as unknown as WebSocketLogger,
      ),
      wsLogger,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects notification sockets when the handshake has no token', async () => {
    const client = createSocket();
    const guard = createGuard({
      verifyAsync: jest.fn(),
    });

    await expect(guard.canActivate(createWsContext(client))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects notification sockets when the token cannot be verified', async () => {
    const client = createSocket({
      handshake: {
        auth: { token: 'bad-token' },
        headers: {},
      } as any,
    });
    const guard = createGuard({
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt malformed')),
    });

    await expect(guard.canActivate(createWsContext(client))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('stores authenticated notification socket data from a valid token', async () => {
    const client = createSocket({
      handshake: {
        auth: { token: 'good-token' },
        headers: {},
      } as any,
    });
    const guard = createGuard(
      {
        verifyAsync: jest.fn().mockResolvedValue({
          sub: 'user-1',
          username: 'alice',
        }),
      },
      {
        findById: jest.fn().mockResolvedValue({
          id: 1,
          username: 'alice',
          role: 'user',
          is_active: true,
        }),
      },
    );

    await expect(guard.canActivate(createWsContext(client))).resolves.toBe(
      true,
    );

    expect(client.data).toEqual({
      userId: 'user-1',
      username: 'alice',
      user: {
        id: 1,
        username: 'alice',
        role: 'user',
        is_active: true,
      },
    });
  });

  it('rejects verified notification tokens without a subject claim', async () => {
    const client = createSocket({
      handshake: {
        auth: { token: 'missing-sub-token' },
        headers: {},
      } as any,
    });
    const guard = createGuard({
      verifyAsync: jest.fn().mockResolvedValue({ username: 'alice' }),
    });

    await expect(guard.canActivate(createWsContext(client))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(client.data).toEqual({});
  });

  it('keeps notification namespace CORS scoped to the configured frontend origin', () => {
    const { gateway } = createGateway();
    const server = {
      engine: { opts: {} },
    } as unknown as Server;
    (gateway as any).configService.get = jest.fn((key: string) =>
      key === 'FRONTEND_URL' ? 'https://app.xconfess.example' : undefined,
    );

    gateway.afterInit(server);

    expect(server.engine.opts.cors).toEqual({
      origin: 'https://app.xconfess.example',
      credentials: true,
    });
    expect(server.engine.opts.cors.origin).not.toBe(
      'https://evil.example',
    );
  });

  it('does not allow wrong origins in global websocket CORS options', () => {
    const options = buildWebSocketServerOptions('https://app.xconfess.example');

    expect(options.cors).toEqual({
      origin: 'https://app.xconfess.example',
      credentials: true,
      methods: ['GET', 'POST'],
    });
    expect((options.cors as any).origin).not.toBe('*');
    expect((options.cors as any).origin).not.toBe('https://evil.example');
  });

  it('joins only the authenticated user notification room on connection', () => {
    const { gateway, wsLogger } = createGateway();
    const client = createSocket({
      data: { userId: 'user-1' },
    });

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(wsLogger.logSubscriptionGranted).toHaveBeenCalledWith({
      socketId: 'socket-1',
      userId: 'user-1',
      channel: 'user:user-1',
    });
  });

  it('emits unread sync on connection for reconnect-safe notification loading', async () => {
    const { gateway } = createGateway();
    const client = createSocket({
      data: { userId: 'user-1' },
    });
    gateway.notificationService.getUserNotifications = jest.fn().mockResolvedValue({
      notifications: [{ id: 'missed-1' }],
      total: 1,
      unreadCount: 1,
    });

    gateway.handleConnection(client);
    await Promise.resolve();

    expect(gateway.notificationService.getUserNotifications).toHaveBeenCalledWith(
      'user-1',
      { page: 1, limit: 20, unreadOnly: true },
    );
    expect(client.emit).toHaveBeenCalledWith('notifications:sync', {
      notifications: [{ id: 'missed-1' }],
      unreadCount: 1,
      timestamp: expect.any(String),
    });
  });

  it('rejects private notification room subscriptions for another user', () => {
    const { gateway, wsLogger } = createGateway();
    const client = createSocket({
      data: { userId: 'user-1' },
    });

    gateway.handleSubscribeUserNotifications(client, { userId: 'user-2' });

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('subscription:rejected', {
      channel: 'user:user-2',
      reason: 'You can only subscribe to your own notification channel',
      timestamp: expect.any(String),
    });
    expect(wsLogger.logSubscriptionRejected).toHaveBeenCalledWith({
      socketId: 'socket-1',
      userId: 'user-1',
      channel: 'user:user-2',
      reason:
        "Ownership violation — authenticated as 'user-1', attempted to subscribe to 'user-2'",
    });
  });

  it('confirms private notification room subscriptions for the socket owner', () => {
    const { gateway, wsLogger } = createGateway();
    const client = createSocket({
      data: { userId: 'user-1' },
    });

    gateway.handleSubscribeUserNotifications(client, { userId: 'user-1' });

    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.emit).toHaveBeenCalledWith('subscription:confirmed', {
      channel: 'user:user-1',
      timestamp: expect.any(String),
    });
    expect(wsLogger.logSubscriptionGranted).toHaveBeenCalledWith({
      socketId: 'socket-1',
      userId: 'user-1',
      channel: 'user:user-1',
    });
  });

  it('sends notification events only to the authenticated user room', async () => {
    const { gateway } = createGateway();
    const roomEmitter = { emit: jest.fn() };
    gateway.server = {
      to: jest.fn().mockReturnValue(roomEmitter),
    } as any;
    gateway.notificationService.getUserNotifications = jest
      .fn()
      .mockResolvedValue({ unreadCount: 3 });

    await gateway.sendNotificationToUser('user-1', { id: 'notif-1' });

    expect(gateway.server.to).toHaveBeenCalledWith('user:user-1');
    expect(roomEmitter.emit).toHaveBeenCalledWith('new-notification', { id: 'notif-1' });
    expect(roomEmitter.emit).toHaveBeenCalledWith('unread-count', { count: 3 });
  });

  // ─── Auth telemetry: correlation IDs and reason codes ──────────────

  it('rejects notification sockets with an expired token using EXPIRED_TOKEN reason code', async () => {
    const client = createSocket({
      handshake: {
        auth: { token: 'expired-token' },
        headers: {},
      } as any,
    });
    const guard = createGuard({
      verifyAsync: jest
        .fn()
        .mockRejectedValue(
          new TokenExpiredError('jwt expired', new Date('2024-01-01')),
        ),
    });

    let error: UnauthorizedException | undefined;
    try {
      await guard.canActivate(createWsContext(client));
    } catch (e) {
      error = e as UnauthorizedException;
    }

    expect(error).toBeDefined();
    expect(error!.getResponse()).toMatchObject({
      reasonCode: 'EXPIRED_TOKEN',
    });
  });

  it('includes a correlationId and reasonCode in auth failure responses', async () => {
    const client = createSocket();
    const guard = createGuard({
      verifyAsync: jest.fn(),
    });

    let error: UnauthorizedException | undefined;
    try {
      await guard.canActivate(createWsContext(client));
    } catch (e) {
      error = e as UnauthorizedException;
    }

    expect(error).toBeDefined();
    const response = error!.getResponse() as Record<string, unknown>;
    expect(response).toMatchObject({
      reasonCode: 'NO_TOKEN_PROVIDED',
    });
    expect(response).toHaveProperty('correlationId');
    expect(typeof response.correlationId).toBe('string');
  });

  it('redacts sensitive handshake headers after token extraction', async () => {
    const client = createSocket({
      handshake: {
        auth: {},
        headers: {
          authorization: 'Bearer super-secret-jwt',
          cookie: 'token=super-secret-cookie; foo=bar',
        },
      } as any,
    });

    // Token should be extracted from Authorization header
    const guard = createGuard({
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt malformed')),
    });

    await expect(guard.canActivate(createWsContext(client))).rejects.toThrow(
      UnauthorizedException,
    );

    // After extraction, the raw values should be scrubbed
    const headers = client.handshake?.headers as Record<string, string>;
    expect(headers['authorization']).not.toContain('super-secret-jwt');
    expect(headers['cookie']).not.toContain('super-secret-cookie');
  });
});
