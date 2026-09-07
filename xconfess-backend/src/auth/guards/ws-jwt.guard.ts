import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { UserService } from '../../user/user.service';
import { WebSocketLogger } from '../../websocket/websocket.logger';
import { randomUUID } from 'crypto';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-auth-token',
]);

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private jwtService: JwtService,
    @Optional() private userService?: UserService,
    @Optional() private websocketLogger?: WebSocketLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const correlationId = this.generateCorrelationId();

    const token = this.extractToken(client);
    if (!token) {
      const reasonCode = 'NO_TOKEN_PROVIDED';
      this.logger.warn({
        event: 'WS_AUTH_FAILURE',
        reasonCode,
        socketId: client.id,
        correlationId,
        msg: 'No authentication token provided on socket handshake',
      });
      this.websocketLogger?.logAuthFailure({
        socketId: client.id,
        reasonCode,
        correlationId,
      });
      throw this.buildAuthException(reasonCode, correlationId);
    }

    try {
      const payload: any = await this.jwtService.verifyAsync(token);
      if (!payload?.sub) {
        const reasonCode = 'MISSING_SUBJECT';
        this.logger.warn({
          event: 'WS_AUTH_FAILURE',
          reasonCode,
          socketId: client.id,
          correlationId,
          msg: 'Verified WS token did not contain a subject',
        });
        this.websocketLogger?.logAuthFailure({
          socketId: client.id,
          reasonCode,
          correlationId,
        });
        throw this.buildAuthException(reasonCode, correlationId);
      }

      // Attach useful user info to the socket for downstream handlers
      client.data = client.data || {};
      client.data.userId = payload.sub;
      client.data.username = payload.username;

      // Try to fetch user (optional) to populate role or other fields
      try {
        if (!this.userService) {
          return true;
        }

        const user = await this.userService.findById(Number(payload.sub));
        if (user) {
          client.data.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            is_active: user.is_active,
          };
        }
      } catch (err) {
        // non-fatal: log and continue with minimal payload
        this.logger.warn({
          event: 'WS_AUTH_USER_FETCH_ERROR',
          reasonCode: 'USER_MAPPING_FAILED',
          socketId: client.id,
          userId: payload.sub,
          correlationId,
          msg: `Failed to fetch user for WS auth: ${err instanceof Error ? err.message : err}`,
        });
      }

      return true;
    } catch (err) {
      const reasonCode =
        err instanceof TokenExpiredError ? 'EXPIRED_TOKEN' : 'MALFORMED_TOKEN';
      this.logger.warn({
        event: 'WS_AUTH_FAILURE',
        reasonCode,
        socketId: client.id,
        correlationId,
        error: err instanceof Error ? err.message : String(err),
        msg: `WebSocket auth failed: ${reasonCode}`,
      });
      this.websocketLogger?.logAuthFailure({
        socketId: client.id,
        reasonCode,
        correlationId,
      });
      throw this.buildAuthException(reasonCode, correlationId);
    }
  }

  private generateCorrelationId(): string {
    return randomUUID();
  }

  private buildAuthException(
    reasonCode: string,
    correlationId: string,
  ): UnauthorizedException {
    return new UnauthorizedException({
      message: 'Authentication failed',
      reasonCode,
      correlationId,
    });
  }

  private extractToken(client: Socket): string | null {
    // 1) Prefer handshake.auth.token (socket.io client can send via auth)
    const auth = client.handshake?.auth as any;
    if (auth && typeof auth.token === 'string' && auth.token.trim()) {
      this.scrubSensitiveHeaders(client);
      return auth.token.trim();
    }

    // 2) Authorization header (Bearer token)
    const authHeader = client.handshake?.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      this.scrubSensitiveHeaders(client);
      return token;
    }

    // 3) Cookies: look for common cookie names like 'token' or 'jwt' or 'access_token'
    const cookieHeader = client.handshake?.headers?.cookie;
    if (cookieHeader) {
      const pairs = cookieHeader.split(';').map((p) => p.trim());
      for (const pair of pairs) {
        const [key, ...rest] = pair.split('=');
        const value = rest.join('=');
        if (!key || !value) continue;
        const k = key.trim();
        if (['token', 'jwt', 'access_token'].includes(k)) {
          this.scrubSensitiveHeaders(client);
          return decodeURIComponent(value.trim());
        }
      }
    }

    return null;
  }

  /**
   * Replace known sensitive header values with a placeholder so
   * downstream middleware, serializers, and loggers never see the
   * raw credential material.
   */
  private scrubSensitiveHeaders(client: Socket): void {
    const headers = client.handshake?.headers as Record<string, string> | undefined;
    if (!headers) return;
    for (const name of SENSITIVE_HEADERS) {
      if (headers[name]) {
        headers[name] = '<REDACTED>';
      }
    }
  }
}

export default WsJwtGuard;
