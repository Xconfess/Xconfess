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
import { Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsJwtGuard } from '../../auth/guards/ws-jwt.guard';
import { NotificationService } from '../services/notification.service';
import { WebSocketLogger } from '../../websocket/websocket.logger';

/** Channel prefix for per-user private rooms */
const USER_ROOM_PREFIX = 'user:';

@WebSocketGateway({
  namespace: '/notifications',
  transports: ['websocket', 'polling'],
})
@UseGuards(WsJwtGuard)
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socket IDs

  constructor(
    private notificationService: NotificationService,
    private configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly wsLogger: WebSocketLogger,
  ) {}

  afterInit(server: Server) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('app.frontendUrl') ||
      'http://localhost:3000';
    if (server.engine?.opts) {
      server.engine.opts.cors = {
        origin: frontendUrl,
        credentials: true,
      };
    } else {
      this.logger.warn(
        'Socket.IO engine options are unavailable; using gateway CORS defaults',
      );
    }
    if (typeof server.use === 'function') {
      server.use(async (socket, next) => {
        try {
          const token = this.extractHandshakeToken(socket);
          if (!token) {
            return next(new Error('Authentication failed'));
          }

          const payload: any = await this.jwtService.verifyAsync(token);
          if (!payload?.sub) {
            return next(new Error('Authentication failed'));
          }

          socket.data = socket.data || {};
          socket.data.userId = String(payload.sub);
          socket.data.username = payload.username;
          return next();
        } catch {
          return next(new Error('Authentication failed'));
        }
      });
    }
    this.logger.log('Notification Gateway initialized');
  }

  private extractHandshakeToken(socket: Socket): string | null {
    const auth = socket.handshake?.auth as any;
    if (auth && typeof auth.token === 'string' && auth.token.trim()) {
      return auth.token.trim();
    }

    const authHeader = socket.handshake?.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length).trim();
    }

    return null;
  }

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  handleConnection(client: Socket) {
    const userId = client.data.userId;

    if (!userId) {
      this.wsLogger.logSubscriptionRejected({
        socketId: client.id,
        channel: `${USER_ROOM_PREFIX}<unknown>`,
        reason:
          'No authenticated userId on socket — WsJwtGuard may have been bypassed',
      });
      client.disconnect();
      return;
    }

    // Add socket to user's socket set
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.add(client.id);
    }

    this.logger.log(`Client connected: ${client.id} (User: ${userId})`);

    // Join the user-specific room — scoped fanout enforced here
    const userRoom = `${USER_ROOM_PREFIX}${userId}`;
    client.join(userRoom);

    this.wsLogger.logSubscriptionGranted({
      socketId: client.id,
      userId,
      channel: userRoom,
    });

    void this.emitUnreadSync(client, userId);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (userId && this.userSockets.has(userId)) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);

        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Subscription handlers ────────────────────────────────────────────────

  /**
   * Explicit channel-subscription handler.
   *
   * Clients call this after connecting to confirm they want to receive
   * events for a specific user room. The handler enforces that the
   * requested userId matches the authenticated socket owner, preventing
   * any client from subscribing to another user's private channel.
   */
  @SubscribeMessage('subscribe:user-notifications')
  handleSubscribeUserNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: string },
  ) {
    const authenticatedUserId = String(client.data.userId);
    const requestedUserId = data?.userId ? String(data.userId) : null;

    // If the client specifies a userId, it must match their own
    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      this.wsLogger.logSubscriptionRejected({
        socketId: client.id,
        userId: authenticatedUserId,
        channel: `${USER_ROOM_PREFIX}${requestedUserId}`,
        reason: `Ownership violation — authenticated as '${authenticatedUserId}', attempted to subscribe to '${requestedUserId}'`,
      });
      client.emit('subscription:rejected', {
        channel: `${USER_ROOM_PREFIX}${requestedUserId}`,
        reason: 'You can only subscribe to your own notification channel',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userRoom = `${USER_ROOM_PREFIX}${authenticatedUserId}`;

    // Ensure the socket is in its own room (idempotent — socket.io handles duplicates)
    client.join(userRoom);

    this.wsLogger.logSubscriptionGranted({
      socketId: client.id,
      userId: authenticatedUserId,
      channel: userRoom,
    });

    client.emit('subscription:confirmed', {
      channel: userRoom,
      timestamp: new Date().toISOString(),
    });

    void this.emitUnreadSync(client, authenticatedUserId);
  }

  @SubscribeMessage('join-notifications')
  handleLegacyJoinNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() requestedUserId?: string,
  ) {
    this.handleSubscribeUserNotifications(client, { userId: requestedUserId });
  }

  private async emitUnreadSync(client: Socket, userId: string) {
    try {
      const result = await this.notificationService.getUserNotifications(
        userId,
        { page: 1, limit: 20, unreadOnly: true },
      );
      client.emit('notifications:sync', {
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Error syncing unread notifications:`, error);
      client.emit('notifications:sync-failed', {
        message: 'Failed to sync unread notifications',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Unsubscribe from the user-notifications channel.
   * The client leaves their private room but the WS connection stays open.
   */
  @SubscribeMessage('unsubscribe:user-notifications')
  async handleUnsubscribeUserNotifications(@ConnectedSocket() client: Socket) {
    const userId = String(client.data.userId);
    const userRoom = `${USER_ROOM_PREFIX}${userId}`;
    await client.leave(userRoom);

    this.logger.log(`User ${userId} left ${userRoom} (${client.id})`);
    client.emit('subscription:cancelled', {
      channel: userRoom,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Existing message handlers ────────────────────────────────────────────

  @SubscribeMessage('mark-read')
  async handleMarkRead(client: Socket, payload: { notificationId: string }) {
    const userId = client.data.userId;

    try {
      await this.notificationService.markAsRead(payload.notificationId, userId);

      client.emit('notification-read', {
        notificationId: payload.notificationId,
      });
    } catch (error) {
      this.logger.error(`Error marking notification as read:`, error);
      client.emit('error', { message: 'Failed to mark notification as read' });
    }
  }

  @SubscribeMessage('mark-all-read')
  async handleMarkAllRead(client: Socket) {
    const userId = client.data.userId;

    try {
      await this.notificationService.markAllAsRead(userId);

      client.emit('all-notifications-read', {});
    } catch (error) {
      this.logger.error(`Error marking all notifications as read:`, error);
      client.emit('error', {
        message: 'Failed to mark all notifications as read',
      });
    }
  }

  @SubscribeMessage('get-unread-count')
  async handleGetUnreadCount(client: Socket) {
    const userId = client.data.userId;

    try {
      const { unreadCount } =
        await this.notificationService.getUserNotifications(userId, {
          page: 1,
          limit: 1,
          unreadOnly: true,
        });

      client.emit('unread-count', { count: unreadCount });
    } catch (error) {
      this.logger.error(`Error getting unread count:`, error);
      client.emit('error', { message: 'Failed to get unread count' });
    }
  }

  // ─── Scoped fanout helpers ─────────────────────────────────────────────────
  // All emissions target `user:<userId>` rooms — never broadcast to the full
  // namespace, ensuring strict per-user isolation.

  async sendNotificationToUser(userId: string, notification: any) {
    const shouldDeliver = await this.notificationService.shouldDeliverRealtime(
      userId,
      notification.type,
    );
    if (!shouldDeliver) {
      this.logger.log(
        `Realtime notification suppressed for user ${userId} (preference check)`,
      );
      return;
    }

    const userRoom = `${USER_ROOM_PREFIX}${userId}`;
    this.server.to(userRoom).emit('new-notification', notification);

    // Also send updated unread count
    const { unreadCount } = await this.notificationService.getUserNotifications(
      userId,
      { page: 1, limit: 1, unreadOnly: true },
    );

    this.server.to(userRoom).emit('unread-count', { count: unreadCount });
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }
}
