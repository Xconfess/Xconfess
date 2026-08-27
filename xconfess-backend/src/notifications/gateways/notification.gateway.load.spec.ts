import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NotificationGateway } from './notification.gateway';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from '../services/notification.service';
import { WebSocketLogger } from '../../websocket/websocket.logger';

const JWT_SECRET = 'WS_FANOUT_TEST_SECRET';

describe('NotificationGateway load test', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let gateway: NotificationGateway;
  let serverUrl: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1d' },
        }),
      ],
      providers: [
        NotificationGateway,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((_key: string, fallback: unknown) => fallback),
          },
        },
        {
          provide: WebSocketLogger,
          useValue: {
            logSubscriptionGranted: jest.fn(),
            logSubscriptionRejected: jest.fn(),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            getUserNotifications: jest.fn().mockResolvedValue({ unreadCount: 5 }),
            shouldDeliverRealtime: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    gateway = moduleFixture.get<NotificationGateway>(NotificationGateway);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(0);

    const address = (app.getHttpServer() as any).address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function createClient(userId: string): Promise<Socket> {
    const token = jwtService.sign({ sub: userId, username: `${userId}-user` });
    const socket = io(`${serverUrl}/notifications`, {
      auth: { token },
      transports: ['websocket'],
      extraHeaders: {
        origin: 'http://localhost:3000',
      },
      rejectUnauthorized: false,
    });

    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('Socket connection timed out')), 5000);
    });
  }

  function subscribeClient(socket: Socket, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.once('subscription:confirmed', () => resolve());
      socket.once('subscription:rejected', (payload) =>
        reject(new Error(`Subscription rejected: ${JSON.stringify(payload)}`)),
      );
      socket.emit('subscribe:user-notifications', { userId });
      setTimeout(() => reject(new Error('Subscription timed out')), 5000);
    });
  }

  it('delivers notifications only to the targeted user room under concurrent connections', async () => {
    const clientA = await createClient('user-1');
    const clientB = await createClient('user-2');

    try {
      await Promise.all([
        subscribeClient(clientA, 'user-1'),
        subscribeClient(clientB, 'user-2'),
      ]);

      const eventsA: unknown[] = [];
      const eventsB: unknown[] = [];
      const countsA: unknown[] = [];
      const countsB: unknown[] = [];

      clientA.on('new-notification', (payload) => eventsA.push(payload));
      clientA.on('unread-count', (payload) => countsA.push(payload));
      clientB.on('new-notification', (payload) => eventsB.push(payload));
      clientB.on('unread-count', (payload) => countsB.push(payload));

      await gateway.sendNotificationToUser('user-1', { title: 'Private alert' });

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(eventsA).toEqual([{ title: 'Private alert' }]);
      expect(countsA).toEqual([{ count: 5 }]);
      expect(eventsB).toEqual([]);
      expect(countsB).toEqual([]);
      expect(gateway.isUserOnline('user-1')).toBe(true);
      expect(gateway.isUserOnline('user-2')).toBe(true);
    } finally {
      clientA.close();
      clientB.close();
    }
  }, 20000);
});
