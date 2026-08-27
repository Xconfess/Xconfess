import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { INestApplicationContext, Logger } from '@nestjs/common';

const logger = new Logger('WebSocketAdapter');

export function buildWebSocketServerOptions(
  corsOrigin: string,
  options?: ServerOptions,
): Partial<ServerOptions> {
  return {
    ...options,
    path: options?.path || '/socket.io',
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    // Connection pooling and performance settings
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    upgradeTimeout: 10000, // 10 seconds
    maxHttpBufferSize: 1e6, // 1 MB
    // Transports in order of preference
    transports: ['websocket', 'polling'],
    // Allow upgrades from polling to websocket
    allowUpgrades: true,
    // Compression
    perMessageDeflate: {
      threshold: 1024, // Only compress messages larger than 1KB
    },
    httpCompression: {
      threshold: 1024,
    },
  };
}

export class WebSocketAdapter extends IoAdapter {
  constructor(
    private app: INestApplicationContext,
    private configService: ConfigService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const corsOrigin =
      this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    const serverOptions = buildWebSocketServerOptions(corsOrigin, options);

    const server = super.createIOServer(port, serverOptions);

    /**
     * Global connection middleware — runs before any namespace/gateway logic.
     *
     * Responsibilities:
     *  1. Detect whether a bearer token is present on the handshake.
     *  2. Log the connection attempt with metadata (namespace, IP, token presence).
     *  3. Allow the connection to proceed — actual JWT verification and role
     *     checking happens inside each gateway (AdminGateway / WsJwtGuard).
     *     Gateways are responsible for disconnecting unauthorised sockets.
     *
     * Note: We intentionally do NOT hard-block here for the /reactions namespace
     * since that is a public channel that supports unauthenticated viewers.
     */
    server.use((socket: any, next: (err?: Error) => void) => {
      const namespace: string =
        socket.nsp?.name ?? socket.handshake?.headers?.['x-namespace'] ?? '/';
      const ip: string =
        socket.handshake?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
        socket.handshake?.address ||
        'unknown';

      const hasToken = Boolean(
        socket.handshake?.auth?.token ||
        socket.handshake?.headers?.authorization,
      );

      logger.log({
        event: 'WS_CONNECT',
        namespace,
        socketId: socket.id,
        ip,
        hasToken,
        msg: `Connection attempt on ${namespace}`,
      });

      // For sensitive namespaces we log a warning when there's no token so
      // that ops can spot unauthenticated probes without blocking at this layer.
      const sensitiveNamespaces = ['/notifications', '/admin'];
      if (
        sensitiveNamespaces.some((ns) => namespace.startsWith(ns)) &&
        !hasToken
      ) {
        logger.warn({
          event: 'WS_CONNECT_NO_TOKEN',
          reason: 'UNAUTHENTICATED_PROBE',
          namespace,
          ip,
          socketId: socket.id,
          msg: `Unauthenticated connection attempt on sensitive namespace ${namespace} from ${ip}`,
        });
      }

      next();
    });

    return server;
  }
}
