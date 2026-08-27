import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../user/entities/user.entity';
import { AuthenticatedRequest } from './interfaces/jwt-payload.interface';

/**
 * AdminGuard — single source of truth for admin authorization across all HTTP and WebSocket routes.
 * Rejects unauthenticated requests and any authenticated user whose role is not ADMIN.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new ForbiddenException('User is not authenticated');
    }

    const userRole = String(request.user.role || '').toLowerCase();
    const isAdmin = userRole === UserRole.ADMIN || userRole === 'admin';

    if (!isAdmin) {
      throw new ForbiddenException('Only admins can access this endpoint');
    }

    return true;
  }
}
