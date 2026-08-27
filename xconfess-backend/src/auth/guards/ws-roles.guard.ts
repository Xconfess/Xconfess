import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Socket } from 'socket.io';
import { UserRole } from '../../user/entities/user.entity';
import { WS_ROLES_KEY } from '../decorators/ws-roles.decorator';

/**
 * WebSocket subscription-level roles guard.
 *
 * Works together with the @WsRoles() decorator. When applied to a
 * @SubscribeMessage() handler the guard checks whether the connecting
 * socket's authenticated user has at least one of the required roles.
 *
 * The user object is expected to be placed on `client.data.user` by
 * WsJwtGuard (or the WebSocketAdapter pre-connection middleware) before
 * this guard runs.
 *
 * On failure the guard emits `subscription:rejected` back to the client
 * and returns `false`; it does NOT throw so the connection stays alive
 * (the client is merely denied that particular subscription).
 */
@Injectable()
export class WsRolesGuard implements CanActivate {
  private readonly logger = new Logger(WsRolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      WS_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No role restriction on this handler — allow freely
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const client: Socket = context.switchToWs().getClient<Socket>();
    const user = client.data?.user as
      | { id: number | string; role: UserRole }
      | undefined;

    if (!user) {
      this.logger.warn(
        `[WsRolesGuard] Unauthenticated subscription attempt on socket ${client.id}`,
      );
      client.emit('subscription:rejected', {
        reason: 'Authentication required',
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      this.logger.warn(
        `[WsRolesGuard] Unauthorized subscription attempt — socket: ${client.id}, userId: ${user.id}, role: ${user.role}, required: [${requiredRoles.join(', ')}]`,
      );
      client.emit('subscription:rejected', {
        reason: `Insufficient permissions. Required role(s): ${requiredRoles.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    return true;
  }
}
