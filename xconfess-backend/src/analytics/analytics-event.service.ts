import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_NETWORKS,
  ANALYTICS_SCHEMA_VERSION,
  AnalyticsEvent,
  AnalyticsEventName,
  AnalyticsNetwork,
} from './entities/analytics-event.entity';

export interface RecordAnalyticsEventInput {
  eventName: AnalyticsEventName;
  actorId?: string | number | null;
  occurredAt?: Date;
  network?: AnalyticsNetwork | null;
  assetCode?: string | null;
  txHash?: string | null;
  contractId?: string | null;
  amountAtomic?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

const SENSITIVE_KEYS = [
  'body',
  'content',
  'message',
  'password',
  'password_hash',
  'passwordhash',
  'private_key',
  'privatekey',
  'seed',
  'seed_phrase',
  'seedphrase',
  'jwt',
  'token',
  'session',
  'session_token',
  'authorization',
  'email',
  'phone',
  'ip',
  'user_agent',
  'useragent',
];

const ALLOWED_METADATA_KEYS = new Set([
  'source',
  'state',
  'reason',
  'requestId',
  'confessionId',
  'commentId',
  'reactionId',
  'messageId',
  'tipId',
  'anchorStatus',
]);

@Injectable()
export class AnalyticsEventService {
  private readonly logger = new Logger(AnalyticsEventService.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
    private readonly configService: ConfigService,
  ) {}

  async record(input: RecordAnalyticsEventInput): Promise<AnalyticsEvent | null> {
    if (!this.isEnabled()) {
      return null;
    }

    this.assertAllowedEventName(input.eventName);
    this.assertSafeInput(input);

    const event = this.analyticsEventRepository.create({
      eventName: input.eventName,
      actorId:
        input.actorId === undefined || input.actorId === null
          ? null
          : String(input.actorId),
      occurredAt: input.occurredAt ?? new Date(),
      network: input.network ?? null,
      assetCode: input.assetCode?.toUpperCase() ?? null,
      txHash: input.txHash ?? null,
      contractId: input.contractId ?? null,
      amountAtomic: input.amountAtomic ?? null,
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      idempotencyKey: input.idempotencyKey ?? this.deriveTransactionKey(input),
      metadataJson: this.filterMetadata(input.metadata),
    });

    try {
      return await this.analyticsEventRepository.save(event);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return null;
      }
      this.logger.error(
        `Failed to record analytics event ${input.eventName}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private isEnabled(): boolean {
    return this.configService.get<string>('ANALYTICS_ENABLED', 'true') !== 'false';
  }

  private assertAllowedEventName(eventName: string): void {
    if (!ANALYTICS_EVENT_NAMES.includes(eventName as AnalyticsEventName)) {
      throw new Error(`Analytics event is not allowlisted: ${eventName}`);
    }
  }

  private assertSafeInput(input: RecordAnalyticsEventInput): void {
    if (input.network && !ANALYTICS_NETWORKS.includes(input.network)) {
      throw new Error(`Analytics network is not allowlisted: ${input.network}`);
    }

    const payload = {
      ...input,
      metadata: input.metadata ?? undefined,
    };
    this.assertNoSensitiveKeys(payload);
  }

  private assertNoSensitiveKeys(value: unknown, path = ''): void {
    if (!value || typeof value !== 'object') {
      return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (
        SENSITIVE_KEYS.some(
          (sensitive) => normalized === sensitive.replace(/[^a-z0-9]/g, ''),
        )
      ) {
        throw new Error(`Analytics payload contains a sensitive field: ${path}${key}`);
      }
      this.assertNoSensitiveKeys(child, `${path}${key}.`);
    }
  }

  private filterMetadata(
    metadata?: Record<string, unknown> | null,
  ): Record<string, string | number | boolean | null> | null {
    if (!metadata) {
      return null;
    }

    const safe: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!ALLOWED_METADATA_KEYS.has(key)) {
        continue;
      }
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
      ) {
        safe[key] = value;
      }
    }

    return Object.keys(safe).length > 0 ? safe : null;
  }

  private deriveTransactionKey(input: RecordAnalyticsEventInput): string | null {
    if (!input.txHash) {
      return null;
    }
    return `${input.eventName}:${input.txHash}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string })?.code === '23505'
    );
  }
}
