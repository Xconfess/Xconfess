import {
  ExecutionContext,
  Injectable,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  private mapJwtAuthError(err: any, info: any) {
    const message = err?.message || info?.message || 'Unauthorized';
    const normalized = String(message).toLowerCase();

    if (
      normalized.includes('jwt expired') ||
      normalized.includes('token expired') ||
      normalized.includes('expired')
    ) {
      return {
        message: 'Authentication token has expired',
        code: ErrorCode.AUTH_SESSION_EXPIRED,
      };
    }

    if (
      normalized.includes('invalid token') ||
      normalized.includes('invalid signature') ||
      normalized.includes('jwt malformed') ||
      normalized.includes('no auth token') ||
      normalized.includes('invalid jwt')
    ) {
      return {
        message: 'Invalid authentication token',
        code: ErrorCode.AUTH_TOKEN_INVALID,
      };
    }

    return {
      message: 'Unauthorized',
      code: ErrorCode.AUTH_UNAUTHORIZED,
    };
  }

  handleRequest(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ) {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      const reason = err?.message || info?.message || 'UNAUTHORIZED';
      this.logger.warn({
        event: 'JWT_AUTH_FAILURE',
        reason,
        path: request.url,
        method: request.method,
        ip: request.ip,
        correlationId: request.headers['x-correlation-id'],
      });

      const { message, code } = this.mapJwtAuthError(err, info);
      throw new AppException(message, code, HttpStatus.UNAUTHORIZED);
    }
    return user;
  }
}
