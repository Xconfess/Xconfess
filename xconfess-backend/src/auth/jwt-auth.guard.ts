import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ) {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      this.logger.warn({
        event: 'JWT_AUTH_FAILURE',
        reason: err ? err.message : info ? info.message : 'UNAUTHORIZED',
        path: request.url,
        method: request.method,
        ip: request.ip,
        correlationId: request.headers['x-correlation-id'],
      });
      throw err || new UnauthorizedException('Unauthorized');
    }
    return user;
  }
}
