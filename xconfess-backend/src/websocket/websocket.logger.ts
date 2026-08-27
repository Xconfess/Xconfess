import { Injectable, Logger } from '@nestjs/common';

interface ConnectionMetrics {
  totalConnections: number;
  activeRooms: number;
  totalEvents: number;
  eventsByType: Record<string, number>;
  avgLatency: number;
  errors: number;
  authFailures: Record<string, number>;
}

interface EventLog {
  timestamp: Date;
  eventType: string;
  confessionId?: string;
  socketId: string;
  latency?: number;
  success: boolean;
  error?: string;
}

@Injectable()
export class WebSocketLogger {
  private readonly logger = new Logger(WebSocketLogger.name);
  private metrics: ConnectionMetrics = {
    totalConnections: 0,
    activeRooms: 0,
    totalEvents: 0,
    eventsByType: {},
    avgLatency: 0,
    errors: 0,
    authFailures: {},
  };

  private eventLogs: EventLog[] = [];
  private readonly maxLogs = 1000; // Keep last 1000 events
  private latencies: number[] = [];

  /**
   * Log a new connection
   */
  logConnection(socketId: string, ip: string) {
    this.metrics.totalConnections++;
    this.logger.log(
      `[CONNECT] Socket: ${socketId}, IP: ${ip}, Total: ${this.metrics.totalConnections}`,
    );
  }

  /**
   * Log a disconnection
   */
  logDisconnection(socketId: string, ip: string) {
    this.metrics.totalConnections--;
    this.logger.log(
      `[DISCONNECT] Socket: ${socketId}, IP: ${ip}, Total: ${this.metrics.totalConnections}`,
    );
  }

  /**
   * Log a WebSocket event
   */
  logEvent(
    eventType: string,
    socketId: string,
    confessionId?: string,
    success: boolean = true,
    error?: string,
    latency?: number,
  ) {
    this.metrics.totalEvents++;
    this.metrics.eventsByType[eventType] =
      (this.metrics.eventsByType[eventType] || 0) + 1;

    if (!success) {
      this.metrics.errors++;
    }

    if (latency) {
      this.latencies.push(latency);
      if (this.latencies.length > 100) {
        this.latencies.shift(); // Keep only last 100 latencies
      }
      this.metrics.avgLatency = this.calculateAvgLatency();
    }

    const eventLog: EventLog = {
      timestamp: new Date(),
      eventType,
      socketId,
      confessionId,
      latency,
      success,
      error,
    };

    this.eventLogs.push(eventLog);

    // Keep only recent logs
    if (this.eventLogs.length > this.maxLogs) {
      this.eventLogs.shift();
    }

    // Log based on event type
    const logLevel = success ? 'debug' : 'warn';
    const message = `[${eventType.toUpperCase()}] Socket: ${socketId}${confessionId ? `, Confession: ${confessionId}` : ''}${latency ? `, Latency: ${latency}ms` : ''}${error ? `, Error: ${error}` : ''}`;

    if (logLevel === 'debug') {
      this.logger.debug(message);
    } else {
      this.logger.warn(message);
    }
  }

  /**
   * Log a broadcast event
   */
  logBroadcast(
    eventType: string,
    confessionId: string,
    recipientCount: number,
    latency?: number,
  ) {
    this.logger.log(
      `[BROADCAST] Event: ${eventType}, Confession: ${confessionId}, Recipients: ${recipientCount}${latency ? `, Latency: ${latency}ms` : ''}`,
    );

    this.logEvent(
      eventType,
      'broadcast',
      confessionId,
      true,
      undefined,
      latency,
    );
  }

  /**
   * Log a rate limit event
   */
  logRateLimit(socketId: string, ip: string) {
    this.metrics.errors++;
    this.logger.warn(`[RATE_LIMIT] Socket: ${socketId}, IP: ${ip}`);
  }

  /**
   * Log a WebSocket authentication failure with reason code.
   * Tracks failure counts by reason for operational metrics.
   */
  logAuthFailure(meta: {
    socketId: string;
    reasonCode: string;
    correlationId?: string;
  }) {
    this.metrics.errors++;
    this.metrics.authFailures[meta.reasonCode] =
      (this.metrics.authFailures[meta.reasonCode] || 0) + 1;

    this.logger.warn(
      `[AUTH_FAILURE] Socket: ${meta.socketId}, Reason: ${meta.reasonCode}${meta.correlationId ? `, CorrelationId: ${meta.correlationId}` : ''}`,
    );

    this.logEvent(
      'auth_failure',
      meta.socketId,
      undefined,
      false,
      meta.reasonCode,
    );
  }

  /**
   * Log room subscription
   */
  logRoomSubscription(
    socketId: string,
    confessionId: string,
    action: 'subscribe' | 'unsubscribe',
  ) {
    this.logger.debug(
      `[ROOM_${action.toUpperCase()}] Socket: ${socketId}, Confession: ${confessionId}`,
    );
  }

  /**
   * Log a rejected subscription attempt with full audit metadata.
   * Called whenever a client tries to subscribe to a channel without
   * the required authentication or role.
   */
  logSubscriptionRejected(meta: {
    socketId: string;
    userId?: string | number;
    channel: string;
    reason: string;
    timestamp?: Date;
  }) {
    this.metrics.errors++;

    const ts = (meta.timestamp ?? new Date()).toISOString();
    this.logger.warn(
      `[SUBSCRIPTION_REJECTED] Socket: ${meta.socketId}, User: ${meta.userId ?? 'anonymous'}, Channel: ${meta.channel}, Reason: ${meta.reason}, Timestamp: ${ts}`,
    );

    // Also capture in the internal event log for metrics queries
    this.logEvent(
      'subscription_rejected',
      meta.socketId,
      meta.channel,
      false,
      meta.reason,
    );
  }

  /**
   * Log a successful subscription for audit trail.
   */
  logSubscriptionGranted(meta: {
    socketId: string;
    userId?: string | number;
    channel: string;
  }) {
    this.logger.log(
      `[SUBSCRIPTION_GRANTED] Socket: ${meta.socketId}, User: ${meta.userId ?? 'anonymous'}, Channel: ${meta.channel}`,
    );

    this.logEvent('subscription_granted', meta.socketId, meta.channel, true);
  }

  /**
   * Log an error
   */
  logError(context: string, error: Error | string, socketId?: string) {
    this.metrics.errors++;
    const errorMessage = error instanceof Error ? error.message : error;
    this.logger.error(
      `[ERROR] Context: ${context}${socketId ? `, Socket: ${socketId}` : ''}, Error: ${errorMessage}`,
    );
  }

  /**
   * Get current metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent event logs
   */
  getRecentLogs(limit: number = 100): EventLog[] {
    return this.eventLogs.slice(-limit);
  }

  /**
   * Get logs filtered by event type
   */
  getLogsByEventType(eventType: string, limit: number = 100): EventLog[] {
    return this.eventLogs
      .filter((log) => log.eventType === eventType)
      .slice(-limit);
  }

  /**
   * Get error logs
   */
  getErrorLogs(limit: number = 100): EventLog[] {
    return this.eventLogs.filter((log) => !log.success).slice(-limit);
  }

  /**
   * Calculate average latency
   */
  private calculateAvgLatency(): number {
    if (this.latencies.length === 0) return 0;
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.latencies.length);
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics() {
    this.metrics = {
      totalConnections: 0,
      activeRooms: 0,
      totalEvents: 0,
      eventsByType: {},
      avgLatency: 0,
      errors: 0,
      authFailures: {},
    };
    this.eventLogs = [];
    this.latencies = [];
    this.logger.log('[RESET] Metrics reset');
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const errorRate =
      metrics.totalEvents > 0
        ? ((metrics.errors / metrics.totalEvents) * 100).toFixed(2)
        : '0.00';

    return `
╔════════════════════════════════════════════════════════════╗
║           WebSocket Performance Report                     ║
╠════════════════════════════════════════════════════════════╣
║ Total Connections:  ${metrics.totalConnections.toString().padEnd(36)} ║
║ Active Rooms:       ${metrics.activeRooms.toString().padEnd(36)} ║
║ Total Events:       ${metrics.totalEvents.toString().padEnd(36)} ║
║ Average Latency:    ${metrics.avgLatency}ms${' '.repeat(32 - metrics.avgLatency.toString().length)} ║
║ Errors:             ${metrics.errors.toString().padEnd(36)} ║
║ Error Rate:         ${errorRate}%${' '.repeat(33 - errorRate.length)} ║
╠════════════════════════════════════════════════════════════╣
║ Events by Type:                                            ║
${Object.entries(metrics.eventsByType)
  .map(
    ([type, count]) =>
      `║ - ${type.padEnd(20)} ${count.toString().padStart(30)} ║`,
  )
  .join('\n')}
╠════════════════════════════════════════════════════════════╣
║ Auth Failures by Reason:                                   ║
${Object.entries(metrics.authFailures)
  .map(
    ([reason, count]) =>
      `║ - ${reason.padEnd(20)} ${count.toString().padStart(30)} ║`,
  )
  .join('\n')}
╚════════════════════════════════════════════════════════════╝
    `.trim();
  }

  /**
   * Log performance report
   */
  logReport() {
    this.logger.log('\n' + this.generateReport());
  }
}
