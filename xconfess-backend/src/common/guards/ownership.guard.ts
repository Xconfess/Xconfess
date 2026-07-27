import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OWNERSHIP_META, OwnershipMeta } from '../decorators/ownership.decorator';

/**
 * OwnershipGuard — defense-in-depth IDOR prevention.
 *
 * Enforced directly at the NestJS handler level, independent of any
 * Next.js proxy route checks. Even if the proxy is bypassed or
 * misconfigured, this guard will reject cross-user access.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, OwnershipGuard)
 *   @Ownership({ paramKey: 'userId', role: 'user' })
 *   @Get(':userId/export')
 *   getExport(@Param('userId') userId: string, @Req() req) { ... }
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  private readonly logger = new Logger(OwnershipGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<OwnershipMeta>(OWNERSHIP_META, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Ownership() decorator — guard is a no-op for this handler.
    if (!meta) return true;

    const req = context.switchToHttp().getRequest();
    const authedUser = req.user; // set by JwtAuthGuard

    if (!authedUser) {
      throw new ForbiddenException('Not authenticated');
    }

    const authedUserId = authedUser.id ?? authedUser.sub;
    if (!authedUserId) {
      throw new ForbiddenException('Not authenticated');
    }

    // Admins bypass ownership checks when meta allows it.
    if (meta.adminBypass && authedUser.role === 'admin') {
      return true;
    }

    const resourceOwnerId =
      req.params?.[meta.paramKey] ??
      req.body?.[meta.paramKey] ??
      req.query?.[meta.paramKey];

    if (!resourceOwnerId) {
      // If we can't find the ID in the request, fail closed.
      this.logger.warn(
        `OwnershipGuard: paramKey "${meta.paramKey}" not found in request — denying.`,
      );
      throw new ForbiddenException('Ownership check failed: missing resource ID');
    }

    const isSelf = String(authedUserId) === String(resourceOwnerId);
    if (!isSelf) {
      this.logger.warn(
        `IDOR attempt blocked: user ${authedUserId} tried to access resource owned by ${resourceOwnerId}`,
      );
      throw new ForbiddenException('Access denied: resource belongs to another user');
    }

    return true;
  }
}