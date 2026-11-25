import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OperationalMetricsService } from '../observability/operational-metrics.service';
import { WsNamespaceLabel } from '../observability/metric-labels';

/** Defaults are deliberately generous; tune with the env vars below. */
export const DEFAULT_WS_MAX_CONNECTIONS_GLOBAL = 5000;
export const DEFAULT_WS_MAX_CONNECTIONS_PER_USER = 5;

/**
 * Documented rejection event. Sent to a client right before it is
 * disconnected, so well-behaved clients can back off instead of reconnecting
 * in a tight loop. It carries no user ids, counts or limits.
 */
export const WS_CONNECTION_REJECTED_EVENT = 'connection:rejected';

export type WsRejectionScope = 'global' | 'user';

export interface WsConnectionRejectedPayload {
  code: 'WS_CONNECTION_LIMIT_REACHED';
  scope: WsRejectionScope;
  message: string;
  retryAfterSeconds: number;
  timestamp: string;
}

export type WsAdmission =
  | { admitted: true }
  | { admitted: false; payload: WsConnectionRejectedPayload };

export interface WsConnectionStats {
  active: number;
  accepted: number;
  rejectedGlobal: number;
  rejectedUser: number;
  closed: number;
}

const RETRY_AFTER_SECONDS: Record<WsRejectionScope, number> = {
  global: 30,
  user: 10,
};

const SAFE_MESSAGES: Record<WsRejectionScope, string> = {
  global: 'The server is at capacity. Please retry shortly.',
  user: 'Too many open connections for this account. Close one and retry.',
};

/**
 * Admission control for WebSocket connections.
 *
 * - A global cap and a per-user cap bound memory and fd usage.
 * - `admit` / `release` are idempotent per socket id, so a rejected socket's
 *   disconnect event can never free a slot it never held.
 * - Accepted, rejected and closed connections are counted both here (cheap
 *   in-process stats) and in the Prometheus registry when available.
 */
@Injectable()
export class WsConnectionLimiter {
  private readonly bySocket = new Map<string, string>(); // socketId -> userId
  private readonly byUser = new Map<string, number>();
  private readonly stats: WsConnectionStats = {
    active: 0,
    accepted: 0,
    rejectedGlobal: 0,
    rejectedUser: 0,
    closed: 0,
  };

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly metrics?: OperationalMetricsService,
  ) {}

  get maxGlobal(): number {
    return this.readLimit(
      'WS_MAX_CONNECTIONS_GLOBAL',
      DEFAULT_WS_MAX_CONNECTIONS_GLOBAL,
    );
  }

  get maxPerUser(): number {
    return this.readLimit(
      'WS_MAX_CONNECTIONS_PER_USER',
      DEFAULT_WS_MAX_CONNECTIONS_PER_USER,
    );
  }

  /** Try to admit a socket. Re-admitting an admitted socket is a no-op. */
  admit(
    socketId: string,
    userId: string,
    namespace: WsNamespaceLabel = 'notifications',
  ): WsAdmission {
    if (this.bySocket.has(socketId)) return { admitted: true };

    if (this.bySocket.size >= this.maxGlobal) {
      this.stats.rejectedGlobal += 1;
      this.metrics?.recordWsConnection(namespace, 'rejected_global');
      return { admitted: false, payload: this.rejection('global') };
    }

    if ((this.byUser.get(userId) ?? 0) >= this.maxPerUser) {
      this.stats.rejectedUser += 1;
      this.metrics?.recordWsConnection(namespace, 'rejected_user');
      return { admitted: false, payload: this.rejection('user') };
    }

    this.bySocket.set(socketId, userId);
    this.byUser.set(userId, (this.byUser.get(userId) ?? 0) + 1);
    this.stats.accepted += 1;
    this.stats.active = this.bySocket.size;
    this.metrics?.recordWsConnection(namespace, 'accepted');
    return { admitted: true };
  }

  /** Free a socket's slot. Unknown or already-released sockets are ignored. */
  release(
    socketId: string,
    namespace: WsNamespaceLabel = 'notifications',
  ): boolean {
    const userId = this.bySocket.get(socketId);
    if (userId === undefined) return false;

    this.bySocket.delete(socketId);
    const remaining = (this.byUser.get(userId) ?? 1) - 1;
    if (remaining <= 0) this.byUser.delete(userId);
    else this.byUser.set(userId, remaining);

    this.stats.closed += 1;
    this.stats.active = this.bySocket.size;
    this.metrics?.recordWsConnection(namespace, 'closed');
    return true;
  }

  getStats(): Readonly<WsConnectionStats> {
    return { ...this.stats };
  }

  private rejection(scope: WsRejectionScope): WsConnectionRejectedPayload {
    return {
      code: 'WS_CONNECTION_LIMIT_REACHED',
      scope,
      message: SAFE_MESSAGES[scope],
      retryAfterSeconds: RETRY_AFTER_SECONDS[scope],
      timestamp: new Date().toISOString(),
    };
  }

  private readLimit(key: string, fallback: number): number {
    const raw = this.configService.get<number | string>(key);
    const value = typeof raw === 'string' ? Number(raw) : raw;
    return typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : fallback;
  }
}
