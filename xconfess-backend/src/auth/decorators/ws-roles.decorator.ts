import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../user/entities/user.entity';

/**
 * Metadata key used by WsRolesGuard to retrieve the required roles
 * attached to a WebSocket message handler.
 */
export const WS_ROLES_KEY = 'ws_roles';

/**
 * Decorator that marks a @SubscribeMessage() handler as requiring
 * specific user roles. Works in tandem with WsRolesGuard.
 *
 * @example
 * @WsRoles(UserRole.ADMIN)
 * @SubscribeMessage('subscribe:admin-events')
 * handleAdminSubscription(@ConnectedSocket() client: Socket) { ... }
 */
export const WsRoles = (...roles: UserRole[]) =>
  SetMetadata(WS_ROLES_KEY, roles);
