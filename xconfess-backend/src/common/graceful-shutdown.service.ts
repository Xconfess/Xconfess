import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppLogger } from '../logger/logger.service';

const MONITORED_QUEUES = [
  'confession-draft-publisher',
  'notifications',
  'notifications-dlq',
  'export-queue',
] as const;

type MonitoredQueueName = (typeof MONITORED_QUEUES)[number];

@Injectable()
export class GracefulShutdownService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private shutdownResolver: (() => void) | null = null;
  private readonly shutdownTimeoutMs: number;
  private queues: Map<MonitoredQueueName, Queue> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly appLogger: AppLogger,
  ) {
    this.shutdownTimeoutMs = this.configService.get<number>('GRACEFUL_SHUTDOWN_TIMEOUT_MS') ?? 30_000;
  }

  onModuleInit() {
    this.registerSignalHandlers();
  }

  onModuleDestroy() {
    if (!this.isShuttingDown) {
      this.initiateShutdown('module-destroy');
    }
  }

  registerQueue(name: MonitoredQueueName, queue: Queue) {
    this.queues.set(name, queue);
  }

  getQueue(name: MonitoredQueueName): Queue | undefined {
    return this.queues.get(name);
  }

  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  private registerSignalHandlers() {
    const handleSignal = (signal: NodeJS.Signals) => {
      this.logger.log(`Received ${signal}, initiating graceful shutdown...`);
      this.initiateShutdown(signal);
    };

    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    process.on('SIGINT', () => handleSignal('SIGINT'));
  }

  async initiateShutdown(reason: string): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn(`Shutdown already in progress (triggered by ${reason}), waiting...`);
      return this.shutdownPromise ?? Promise.resolve();
    }

    this.isShuttingDown = true;
    this.appLogger.log(`Graceful shutdown initiated: ${reason}`, 'GracefulShutdown');

    this.shutdownPromise = new Promise((resolve) => {
      this.shutdownResolver = resolve;
    });

    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Graceful shutdown timeout after ${this.shutdownTimeoutMs}ms`));
      }, this.shutdownTimeoutMs);
    });

    try {
      await Promise.race([this.executeShutdown(), timeoutPromise]);
    } catch (error) {
      this.logger.error(`Graceful shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
      this.appLogger.error(`Graceful shutdown failed: ${error instanceof Error ? error.message : String(error)}`, 'GracefulShutdown');
      process.exit(1);
    }

    this.logger.log('Graceful shutdown completed successfully');
    this.appLogger.log('Graceful shutdown completed successfully', 'GracefulShutdown');
    this.shutdownResolver?.();
  }

  private async executeShutdown(): Promise<void> {
    this.logger.log('Step 1: Stopping acceptance of new HTTP/WebSocket work...');
    this.eventEmitter.emit('graceful-shutdown:stop-accepting');

    this.logger.log('Step 2: Waiting for active WebSocket connections to close...');
    await this.waitForWebSocketDrain();

    this.logger.log('Step 3: Closing BullMQ workers and pausing queues...');
    await this.closeBullMQWorkers();

    this.logger.log('Step 4: Closing database connections...');
    await this.closeDatabaseConnections();

    this.logger.log('Step 5: Closing Redis connections...');
    await this.closeRedisConnections();

    this.logger.log('Step 6: Emitting final shutdown event...');
    this.eventEmitter.emit('graceful-shutdown:complete');
  }

  private async waitForWebSocketDrain(): Promise<void> {
    const drainTimeoutMs = Math.min(this.shutdownTimeoutMs / 3, 10_000);
    const startTime = Date.now();

    this.eventEmitter.emit('graceful-shutdown:drain-websockets');

    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (Date.now() - startTime > drainTimeoutMs) {
          clearInterval(checkInterval);
          this.logger.warn(`WebSocket drain timeout after ${drainTimeoutMs}ms, proceeding...`);
          resolve();
          return;
        }
        this.eventEmitter.emit('graceful-shutdown:check-websocket-drain');
      }, 100);

      this.eventEmitter.once('graceful-shutdown:websockets-drained', () => {
        clearInterval(checkInterval);
        this.logger.log('All WebSocket connections drained');
        resolve();
      });
    });
  }

  private async closeBullMQWorkers(): Promise<void> {
    const jobsEnabled = this.configService.get<string>('ENABLE_BACKGROUND_JOBS') === 'true';
    if (!jobsEnabled) {
      this.logger.log('Background jobs disabled, skipping BullMQ worker shutdown');
      return;
    }

    for (const [name, queue] of this.queues.entries()) {
      try {
        this.logger.log(`Pausing queue: ${name}`);
        await queue.pause();

        this.logger.log(`Closing queue: ${name}`);
        await queue.close();

        this.logger.log(`Queue ${name} closed successfully`);
      } catch (error) {
        this.logger.error(`Error closing queue ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async closeDatabaseConnections(): Promise<void> {
    this.eventEmitter.emit('graceful-shutdown:close-database');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.logger.warn('Database close timeout, proceeding...');
        resolve();
      }, 5000);

      this.eventEmitter.once('graceful-shutdown:database-closed', () => {
        clearTimeout(timeout);
        this.logger.log('Database connections closed');
        resolve();
      });

      setTimeout(() => {
        if (!this.eventEmitter.listenerCount('graceful-shutdown:database-closed')) {
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }

  private async closeRedisConnections(): Promise<void> {
    this.eventEmitter.emit('graceful-shutdown:close-redis');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.logger.warn('Redis close timeout, proceeding...');
        resolve();
      }, 5000);

      this.eventEmitter.once('graceful-shutdown:redis-closed', () => {
        clearTimeout(timeout);
        this.logger.log('Redis connections closed');
        resolve();
      });

      setTimeout(() => {
        if (!this.eventEmitter.listenerCount('graceful-shutdown:redis-closed')) {
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
  }

  async waitForShutdown(): Promise<void> {
    if (this.shutdownPromise) {
      await this.shutdownPromise;
    }
  }
}