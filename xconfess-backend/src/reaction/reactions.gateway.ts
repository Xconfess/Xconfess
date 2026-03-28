import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocketLogger } from '../websocket/websocket.logger';

// Rate limiting map: socket.id -> { count, resetTime }
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

@WebSocketGateway({
  cors: true,
  namespace: '/reactions',
  transports: ['websocket', 'polling'],
})
export class ReactionsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ReactionsGateway.name);
  private readonly maxConnectionsPerIP = 50;
  private readonly rateLimit = {
    maxRequests: 30, // Max requests per window
    windowMs: 60000, // 1 minute window
  };

  // Track connections per IP for basic DDoS prevention
  private connectionsPerIP = new Map<string, number>();

  constructor(
    private configService: ConfigService,
    private readonly wsLogger: WebSocketLogger,
  ) {}

  afterInit(server: Server) {
    // Configure CORS dynamically from ConfigService
    const frontendUrl = this.configService.get<string>(
      'app.frontendUrl',
      'http://localhost:3000',
    );
    server.engine.opts.cors = {
      origin: frontendUrl,
      credentials: true,
    };

    this.logger.log('WebSocket Gateway initialized');

    // Clean up rate limit map every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [socketId, data] of rateLimitMap.entries()) {
        if (now > data.resetTime) {
          rateLimitMap.delete(socketId);
        }
      }
    }, 300000);
  }

  handleConnection(client: Socket) {
    const clientIP = this.getClientIP(client);
    const currentConnections = this.connectionsPerIP.get(clientIP) || 0;

    // Basic DDoS prevention
    if (currentConnections >= this.maxConnectionsPerIP) {
      this.logger.warn(`Max connections exceeded for IP: ${clientIP}`);
      client.emit('error', {
        message: 'Maximum connections exceeded. Please try again later.',
      });
      client.disconnect();
      return;
    }

    this.connectionsPerIP.set(clientIP, currentConnections + 1);
    this.logger.log(`Client connected: ${client.id} from IP: ${clientIP}`);

    // Initialize rate limiting for this client
    rateLimitMap.set(client.id, {
      count: 0,
      resetTime: Date.now() + this.rateLimit.windowMs,
    });

    client.emit('connected', {
      message: 'Successfully connected to reactions gateway',
      socketId: client.id,
    });
  }

  handleDisconnect(client: Socket) {
    const clientIP = this.getClientIP(client);
    const currentConnections = this.connectionsPerIP.get(clientIP) || 0;

    if (currentConnections > 0) {
      this.connectionsPerIP.set(clientIP, currentConnections - 1);
    }

    // Clean up rate limit data
    rateLimitMap.delete(client.id);

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:confession')
  handleSubscribeToConfession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { confessionId: string },
  ) {
    if (!this.checkRateLimit(client)) {
      return;
    }

    const { confessionId } = data;

    if (
      !confessionId ||
      typeof confessionId !== 'string' ||
      !confessionId.trim()
    ) {
      this.wsLogger.logSubscriptionRejected({
        socketId: client.id,
        userId: client.data?.userId,
        channel: 'confession:<missing>',
        reason: 'Confession ID is required and must be a non-empty string',
      });
      client.emit('error', { message: 'Confession ID is required' });
      return;
    }

    const room = `confession:${confessionId}`;
    client.join(room);

    this.wsLogger.logSubscriptionGranted({
      socketId: client.id,
      userId: client.data?.userId,
      channel: room,
    });
    this.logger.log(`Client ${client.id} subscribed to ${room}`);

    client.emit('subscribed', {
      confessionId,
      message: `Subscribed to confession ${confessionId}`,
    });
  }

  @SubscribeMessage('unsubscribe:confession')
  handleUnsubscribeFromConfession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { confessionId: string },
  ) {
    if (!this.checkRateLimit(client)) {
      return;
    }

    const { confessionId } = data;

    if (
      !confessionId ||
      typeof confessionId !== 'string' ||
      !confessionId.trim()
    ) {
      this.wsLogger.logSubscriptionRejected({
        socketId: client.id,
        userId: client.data?.userId,
        channel: 'confession:<missing>',
        reason: 'Confession ID is required for unsubscription',
      });
      client.emit('error', { message: 'Confession ID is required' });
      return;
    }

    const room = `confession:${confessionId}`;
    client.leave(room);

    this.logger.log(`Client ${client.id} unsubscribed from ${room}`);

    client.emit('unsubscribed', {
      confessionId,
      message: `Unsubscribed from confession ${confessionId}`,
    });
  }

  /**
   * Broadcast when a reaction is added
   */
  broadcastReactionAdded(
    confessionId: string,
    payload: {
      reactionId: string;
      userId: string;
      reactionType: string;
      timestamp: Date;
      totalCount: number;
    },
  ) {
    const room = `confession:${confessionId}`;

    this.server.to(room).emit('reaction:added', {
      confessionId,
      ...payload,
    });

    this.logger.debug(`Broadcasted reaction:added to ${room}`);
  }

  /**
   * Broadcast when a reaction is removed
   */
  broadcastReactionRemoved(
    confessionId: string,
    payload: {
      reactionId: string;
      userId: string;
      reactionType: string;
      timestamp: Date;
      totalCount: number;
    },
  ) {
    const room = `confession:${confessionId}`;

    this.server.to(room).emit('reaction:removed', {
      confessionId,
      ...payload,
    });

    this.logger.debug(`Broadcasted reaction:removed to ${room}`);
  }

  /**
   * Broadcast updated reaction counts for a confession
   */
  broadcastConfessionUpdated(
    confessionId: string,
    payload: {
      reactionCounts: Record<string, number>;
      totalReactions: number;
      timestamp: Date;
    },
  ) {
    const room = `confession:${confessionId}`;

    this.server.to(room).emit('confession:updated', {
      confessionId,
      ...payload,
    });

    this.logger.debug(`Broadcasted confession:updated to ${room}`);
  }

  /**
   * Get client IP address from socket
   */
  private getClientIP(client: Socket): string {
    const forwarded = client.handshake.headers['x-forwarded-for'];

    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }

    return client.handshake.address || 'unknown';
  }

  /**
   * Rate limiting check
   */
  private checkRateLimit(client: Socket): boolean {
    const now = Date.now();
    const limitData = rateLimitMap.get(client.id);

    if (!limitData) {
      rateLimitMap.set(client.id, {
        count: 1,
        resetTime: now + this.rateLimit.windowMs,
      });
      return true;
    }

    // Reset if window has passed
    if (now > limitData.resetTime) {
      rateLimitMap.set(client.id, {
        count: 1,
        resetTime: now + this.rateLimit.windowMs,
      });
      return true;
    }

    // Check if limit exceeded
    if (limitData.count >= this.rateLimit.maxRequests) {
      this.logger.warn(`Rate limit exceeded for client: ${client.id}`);
      client.emit('error', {
        message: 'Rate limit exceeded. Please slow down.',
        retryAfter: Math.ceil((limitData.resetTime - now) / 1000),
      });
      return false;
    }

    // Increment count
    limitData.count++;
    return true;
  }

  /**
   * Get connection statistics (useful for monitoring)
   */
  getConnectionStats() {
    return {
      totalConnections: this.server.sockets.sockets.size,
      connectionsPerIP: Object.fromEntries(this.connectionsPerIP),
      activeRooms: Array.from(this.server.sockets.adapter.rooms.keys()).filter(
        (room) => room.startsWith('confession:'),
      ),
    };
  }
}
