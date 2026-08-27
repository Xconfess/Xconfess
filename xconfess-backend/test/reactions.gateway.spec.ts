import { ReactionsGateway } from '../src/reaction/reactions.gateway';
import { buildWebSocketServerOptions } from '../src/websocket/websocket.adapter';

describe('ReactionsGateway fanout and reconnect unit coverage', () => {
  const createGateway = () => {
    const configService: any = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
    };
    const wsLogger: any = {
      logSubscriptionRejected: jest.fn(),
      logSubscriptionGranted: jest.fn(),
      logEvent: jest.fn(),
    };
    return new ReactionsGateway(configService, wsLogger);
  };

  const createSocketClient = (id: string, ip = '127.0.0.1') =>
    ({
      id,
      data: {},
      handshake: {
        address: ip,
        headers: {},
      },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
    }) as any;

  it('reconnects after network interruption and re-subscribes to room', () => {
    const gateway = createGateway();
    const disconnectedClient = createSocketClient('socket-old');
    const reconnectedClient = createSocketClient('socket-new');

    gateway.handleConnection(disconnectedClient);
    gateway.handleSubscribeToConfession(disconnectedClient, {
      confessionId: 'c-1',
    });
    gateway.handleDisconnect(disconnectedClient);

    gateway.handleConnection(reconnectedClient);
    gateway.handleSubscribeToConfession(reconnectedClient, {
      confessionId: 'c-1',
    });

    expect(disconnectedClient.join).toHaveBeenCalledWith('confession:c-1');
    expect(reconnectedClient.join).toHaveBeenCalledWith('confession:c-1');
    expect(reconnectedClient.emit).toHaveBeenCalledWith(
      'subscribed',
      expect.objectContaining({ confessionId: 'c-1' }),
    );
  });

  it('broadcastReactionAdded fans out only to target channel', () => {
    const gateway = createGateway();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as any).server = { to };

    gateway.broadcastReactionAdded('conf-123', {
      reactionId: 'r-1',
      userId: 'u-1',
      reactionType: 'like',
      timestamp: new Date(),
      totalCount: 3,
    });

    expect(to).toHaveBeenCalledWith('confession:conf-123');
    expect(emit).toHaveBeenCalledWith(
      'reaction:added',
      expect.objectContaining({
        confessionId: 'conf-123',
        totalCount: 3,
      }),
    );
  });

  it('reaction subscriptions never join private user rooms', () => {
    const gateway = createGateway();
    const client = createSocketClient('socket-public');

    gateway.handleConnection(client);
    gateway.handleSubscribeToConfession(client, {
      confessionId: 'user:someone-else',
    });

    expect(client.join).toHaveBeenCalledWith('confession:user:someone-else');
    expect(client.join).not.toHaveBeenCalledWith('user:someone-else');
  });

  it('websocket adapter options keep reconnect-friendly transport and heartbeat defaults', () => {
    const options = buildWebSocketServerOptions('https://frontend.example');

    expect(options.transports).toEqual(['websocket', 'polling']);
    expect(options.allowUpgrades).toBe(true);
    expect(options.pingTimeout).toBe(60000);
    expect(options.pingInterval).toBe(25000);
    expect(options.upgradeTimeout).toBe(10000);
    expect(options.cors).toEqual({
      origin: 'https://frontend.example',
      credentials: true,
      methods: ['GET', 'POST'],
    });
  });
});
