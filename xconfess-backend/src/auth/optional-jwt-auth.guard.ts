import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

/**
 * Like JwtAuthGuard, but does not throw if the Authorization header is missing.
 * This allows endpoints to be "optionally authenticated".
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ) {
    // If a token was present but invalid, let the error bubble up.
    if (err) return super.handleRequest(err, user, info, context, status);
    // If there's no user (no token), just proceed as anonymous.
    return user || null;
  }
}
