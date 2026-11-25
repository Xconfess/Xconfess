import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from '../services/notification.service';
import { WebSocketLogger } from '../../websocket/websocket.logger';
import {
  WS_CONNECTION_REJECTED_EVENT,
  WsConnectionLimiter,
} from '../../websocket/ws-connection-limiter.service';
import { OperationalMetricsService } from '../../observability/operational-metrics.service';

const JWT_SECRET = 'WS_ADMISSION_TEST_SECRET';
const LIMITS: Record<string, number> = {
  WS_MAX_CONNECTIONS_GLOBAL: 6,
  WS_MAX_CONNECTIONS_PER_USER: 2,
  NOTIFICATION_FANOUT_CONCURRENCY: 2,
  NOTIFICATION_FANOUT_MAX_QUEUE: 3,
};

describe('NotificationGateway admission limits and fanout backpressure (#2392, #2393)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let gateway: NotificationGateway;
  let limiter: WsConnectionLimiter;
  let metrics: OperationalMetricsService;
  let notificationService: {
    getUserNotifications: jest.Mock;
    shouldDeliverRealtime: jest.Mock;
  };
  let serverUrl: string;
  const open: Socket[] = [];

  beforeAll(async () => {
    notificationService = {
      getUserNotifications: jest
        .fn()
        .mockResolvedValue({ notifications: [], unreadCount: 0 }),
      shouldDeliverRealtime: jest.fn().mockResolvedValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1d' },
        }),
      ],
      providers: [
        NotificationGateway,
        WsConnectionLimiter,
        OperationalMetricsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) =>
              key in LIMITS ? LIMITS[key] : fallback,
            ),
          },
        },
        {
          provide: WebSocketLogger,
          useValue: {
            logSubscriptionGranted: jest.fn(),
            logSubscriptionRejected: jest.fn(),
          },
        },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    gateway = moduleFixture.get(NotificationGateway);
    limiter = moduleFixture.get(WsConnectionLimiter);
    metrics = moduleFixture.get(OperationalMetricsService);
    jwtService = moduleFixture.get(JwtService);

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(0);
    serverUrl = `http://127.0.0.1:${((app.getHttpServer() as any).address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    open.splice(0).forEach((s) => s.close());
    // Let server-side disconnect handlers run so slots are released.
    await new Promise((r) => setTimeout(r, 150));
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Connects and resolves with the first thing that happens. */
  function connect(
    userId: string,
  ): Promise<{ socket: Socket; rejection?: any }> {
    const token = jwtService.sign({ sub: userId, username: userId });
    const socket = io(`${serverUrl}/notifications`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: 'http://localhost:3000' },
    });
    open.push(socket);

    return new Promise((resolve, reject) => {
      socket.once(WS_CONNECTION_REJECTED_EVENT, (payload) =>
        resolve({ socket, rejection: payload }),
      );
      socket.once('connect', () => {
        // A rejection event, if any, is emitted right after connect.
        setTimeout(() => resolve({ socket }), 150);
      });
      socket.once('connect_error', reject);
      setTimeout(() => reject(new Error('connect timed out')), 5000);
    });
  }

  it('rejects the connection beyond the per-user limit with the documented event', async () => {
    const a = await connect('user-limit');
    const b = await connect('user-limit');
    const c = await connect('user-limit');

    expect(a.rejection).toBeUndefined();
    expect(b.rejection).toBeUndefined();
    expect(c.rejection).toMatchObject({
      code: 'WS_CONNECTION_LIMIT_REACHED',
      scope: 'user',
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(c.socket.connected).toBe(false);
    expect(a.socket.connected).toBe(true);
    expect(gateway.isUserOnline('user-limit')).toBe(true);
    expect(limiter.getStats().active).toBe(2);
  }, 20000);

  it('releases the slot when a client disconnects so it can reconnect', async () => {
    const a = await connect('user-reuse');
    await connect('user-reuse');
    a.socket.close();
    await new Promise((r) => setTimeout(r, 200));

    const again = await connect('user-reuse');
    expect(again.rejection).toBeUndefined();
    expect(again.socket.connected).toBe(true);
  }, 20000);

  it('enforces the global limit under a burst of connections and tracks outcomes', async () => {
    const before = limiter.getStats();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => connect(`burst-${i}`)),
    );

    const accepted = results.filter((r) => !r.rejection);
    const rejected = results.filter((r) => r.rejection);
    expect(accepted).toHaveLength(LIMITS.WS_MAX_CONNECTIONS_GLOBAL);
    expect(rejected).toHaveLength(12 - LIMITS.WS_MAX_CONNECTIONS_GLOBAL);
    rejected.forEach((r) => expect(r.rejection.scope).toBe('global'));

    const after = limiter.getStats();
    expect(after.accepted - before.accepted).toBe(6);
    expect(after.rejectedGlobal - before.rejectedGlobal).toBe(6);
    expect(after.active).toBeLessThanOrEqual(6);

    const text = metrics.renderPrometheus();
    expect(text).toContain('event="rejected_global"');
    expect(text).toContain('xconfess_ws_active_connections');
  }, 30000);

  it('keeps slot accounting consistent after closing everything', async () => {
    await Promise.all([connect('c1'), connect('c2'), connect('c3')]);
    open.splice(0).forEach((s) => s.close());
    await new Promise((r) => setTimeout(r, 300));

    const stats = limiter.getStats();
    expect(stats.active).toBe(0);
    expect(stats.accepted).toBe(stats.closed);
  }, 20000);

  it('applies backpressure to a notification burst without losing any delivery', async () => {
    const { socket } = await connect('fanout-user');
    await new Promise<void>((resolve) => {
      socket.once('subscription:confirmed', () => resolve());
      socket.emit('subscribe:user-notifications', {});
    });
    const received: number[] = [];
    socket.on('new-notification', (n: { seq: number }) => received.push(n.seq));

    // Make each delivery slow so the queue actually fills.
    notificationService.shouldDeliverRealtime.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(true), 5)),
    );

    const total = 60;
    await Promise.all(
      Array.from({ length: total }, (_, seq) =>
        gateway.sendNotificationToUser('fanout-user', { seq, type: 'x' }),
      ),
    );
    await new Promise((r) => setTimeout(r, 400));

    expect(received).toHaveLength(total);
    expect(new Set(received).size).toBe(total);
    const snap = gateway.getFanoutSnapshot();
    expect(snap.peakActive).toBeLessThanOrEqual(2);
    expect(snap.peakQueued).toBeLessThanOrEqual(3);
    expect(snap).toMatchObject({ active: 0, queued: 0, waitingForSpace: 0 });

    const text = metrics.renderPrometheus();
    expect(text).toContain(
      'xconfess_notification_fanout_total{event="overflow"}',
    );
    expect(text).toContain(
      'xconfess_notification_fanout_queue_delay_seconds_count',
    );

    notificationService.shouldDeliverRealtime.mockResolvedValue(true);
  }, 30000);
});
