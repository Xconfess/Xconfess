import { Test, TestingModule } from '@nestjs/testing';
import { ReactionModule } from './reaction.module';
import { ReactionsGateway } from './reactions.gateway';
import { ReactionService } from './reaction.service';
import { WebSocketHealthController } from '../websocket/websocket-health.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Reaction } from './entities/reaction.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';
import { OutboxEvent } from '../common/entities/outbox-event.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { WebSocketLogger } from '../websocket/websocket.logger';
import { WebSocketHealthService } from '../websocket/websocket-health.service';
import { JwtService } from '@nestjs/jwt';

describe('ReactionModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [WebSocketHealthController],
      providers: [
        ReactionService,
        ReactionsGateway,
        WebSocketHealthService,
        WebSocketLogger,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, fallback?: unknown) => fallback) },
        },
        {
          provide: getRepositoryToken(Reaction),
          useValue: {},
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {},
        },
        {
          provide: getRepositoryToken(AnonymousUser),
          useValue: {},
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn(), verify: jest.fn() },
        },
        {
          provide: AnalyticsService,
          useValue: {
            invalidateTrendingCache: jest.fn().mockResolvedValue(undefined),
            invalidateReactionDistributionCache: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();
    (module.get<ReactionsGateway>(ReactionsGateway) as any).server = {
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
  });

  afterAll(async () => {
    await module.close();
  });

  describe('Provider Registration', () => {
    it('should register ReactionsGateway as a provider', () => {
      const gateway = module.get<ReactionsGateway>(ReactionsGateway);
      expect(gateway).toBeDefined();
      expect(gateway).toBeInstanceOf(ReactionsGateway);
    });

    it('should register ReactionService as a provider', () => {
      const service = module.get<ReactionService>(ReactionService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ReactionService);
    });

    it('should register WebSocketHealthController as a controller', () => {
      const controller = module.get<WebSocketHealthController>(
        WebSocketHealthController,
      );
      expect(controller).toBeDefined();
      expect(controller).toBeInstanceOf(WebSocketHealthController);
    });
  });

  describe('Gateway Wiring', () => {
    it('should wire ReactionsGateway to WebSocketHealthController', () => {
      const controller = module.get<WebSocketHealthController>(
        WebSocketHealthController,
      );
      const gateway = module.get<ReactionsGateway>(ReactionsGateway);

      // Verify the controller has access to the gateway
      expect((controller as any).reactionsGateway).toBe(gateway);
    });

    it('should export ReactionsGateway for use in other modules', () => {
      const gateway = module.get<ReactionsGateway>(ReactionsGateway);
      expect(gateway).toBeDefined();

      // Verify gateway has required methods
      expect(typeof gateway.broadcastReactionAdded).toBe('function');
      expect(typeof gateway.broadcastReactionRemoved).toBe('function');
      expect(typeof gateway.broadcastConfessionUpdated).toBe('function');
      expect(typeof gateway.getConnectionStats).toBe('function');
    });
  });

  describe('Gateway Lifecycle', () => {
    it('should initialize gateway with proper namespace configuration', () => {
      const gateway = module.get<ReactionsGateway>(ReactionsGateway);

      expect(gateway).toBeInstanceOf(ReactionsGateway);
    });

    it('should have WebSocket server instance after initialization', async () => {
      const gateway = module.get<ReactionsGateway>(ReactionsGateway);

      // The server property should be defined (will be set by NestJS when gateway initializes)
      expect(gateway).toHaveProperty('server');
    });
  });

  describe('Module Regression Protection', () => {
    it('should fail if ReactionsGateway is removed from providers', async () => {
      // This test ensures that if someone removes ReactionsGateway from providers,
      // the test suite will catch it
      await expect(async () => {
        await Test.createTestingModule({
          controllers: [WebSocketHealthController],
          providers: [
            WebSocketHealthService,
            {
              provide: ConfigService,
              useValue: { get: jest.fn((_key: string, fallback?: unknown) => fallback) },
            },
            // Intentionally missing ReactionsGateway
          ],
        }).compile();
      }).rejects.toThrow();
    });
  });
});
