import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReactionsGateway } from '../src/reaction/reactions.gateway';
import { WebSocketLogger } from '../src/websocket/websocket.logger';

describe('ReactionsGateway Boot Wiring', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ReactionsGateway,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, fallback?: unknown) => fallback) },
        },
        {
          provide: WebSocketLogger,
          useValue: {
            logSubscriptionRejected: jest.fn(),
            logSubscriptionGranted: jest.fn(),
          },
        },
      ],
    }).compile();

    (module.get(ReactionsGateway) as any).server = {
      sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    };
  });

  afterAll(async () => {
    await module.close();
  });

  it('registers ReactionsGateway in the test module graph', () => {
    const gateway = module.get(ReactionsGateway);

    expect(gateway).toBeDefined();
    expect(gateway).toBeInstanceOf(ReactionsGateway);
  });

  it('exposes the expected broadcast and stats methods', () => {
    const gateway = module.get(ReactionsGateway);

    expect(typeof gateway.broadcastReactionAdded).toBe('function');
    expect(typeof gateway.broadcastReactionRemoved).toBe('function');
    expect(typeof gateway.broadcastConfessionUpdated).toBe('function');
    expect(typeof gateway.getConnectionStats).toBe('function');
  });
});
