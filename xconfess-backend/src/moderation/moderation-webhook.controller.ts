import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import {
  ModerationCategory,
  ModerationResult,
  ModerationStatus,
} from './ai-moderation.service';
import { ModerationRepositoryService } from './moderation-repository.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';

interface WebhookPayload {
  eventId: string;
  confessionId: string;
  moderationScore: number;
  moderationFlags: string[];
  moderationStatus: ModerationStatus;
  details: Record<string, number>;
  timestamp: string;
}

/**
 * Parses a timestamped HMAC signature header.
 * Expected format: "t=<unix_timestamp>,v1=<hmac_hex>"
 * The HMAC is computed over "<timestamp>.<serialized_payload>".
 */
function parseSignatureHeader(
  header: string,
): { timestamp: string; signature: string } | null {
  if (!header) return null;

  const parts = header.split(',');
  let timestamp = '';
  let signature = '';

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith('t=')) {
      timestamp = trimmed.substring(2);
    } else if (trimmed.startsWith('v1=')) {
      signature = trimmed.substring(3);
    }
  }

  if (!timestamp || !signature) return null;
  return { timestamp, signature };
}

@Controller('webhooks/moderation')
export class ModerationWebhookController {
  private readonly logger = new Logger(ModerationWebhookController.name);
  private readonly webhookSecret: string;
  private readonly timestampToleranceSeconds: number;

  /**
   * In-memory set of recently processed event IDs for fast replay rejection.
   * Entries are TTL-evicted after the timestamp tolerance window.
   */
  private readonly processedEventIds = new Map<string, number>();
  private readonly eventIdTtlMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepo: Repository<AnonymousConfession>,
    private readonly moderationRepoService: ModerationRepositoryService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.webhookSecret = this.configService.get<string>('WEBHOOK_SECRET', '');
    this.timestampToleranceSeconds = this.configService.get<number>(
      'WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS',
      300,
    );
    this.eventIdTtlMs = this.timestampToleranceSeconds * 2 * 1000;
  }

  @Post('results')
  @HttpCode(HttpStatus.OK)
  async handleModerationResults(
    @Body() payload: WebhookPayload,
    @Headers('x-webhook-signature') signatureHeader: string,
  ) {
    const correlationId = crypto.randomUUID();
    const serializedPayload = JSON.stringify(payload);

    // ─── 1. Reject unsigned requests ────────────────────────────────────
    if (!signatureHeader) {
      this.auditReject(
        correlationId,
        payload,
        'missing_signature',
        'Missing webhook signature header',
      );
      throw new UnauthorizedException('Missing signature');
    }

    // ─── 2. Parse and validate timestamped signature header ─────────────
    const parsed = parseSignatureHeader(signatureHeader);
    if (!parsed) {
      this.auditReject(
        correlationId,
        payload,
        'malformed_signature_header',
        'Malformed signature header format',
      );
      throw new BadRequestException('Malformed signature header');
    }

    // ─── 3. Validate timestamp freshness ────────────────────────────────
    const sigTimestamp = Number(parsed.timestamp);
    if (isNaN(sigTimestamp) || sigTimestamp <= 0) {
      this.auditReject(
        correlationId,
        payload,
        'invalid_timestamp',
        'Invalid timestamp in signature header',
      );
      throw new BadRequestException('Malformed payload: invalid timestamp');
    }

    const nowMs = Date.now();
    const ageSeconds = Math.abs(nowMs - sigTimestamp * 1000) / 1000;
    if (ageSeconds > this.timestampToleranceSeconds) {
      // Audit stale webhook attempt
      this.auditReject(
        correlationId,
        payload,
        'stale_timestamp',
        `Webhook timestamp too old (${Math.round(ageSeconds)}s)`,
      );

      try {
        await this.moderationRepoService.syncWebhookResult({
          confessionId: payload.confessionId ?? '',
          content: serializedPayload,
          result: {
            score: payload.moderationScore ?? 0,
            flags: (payload.moderationFlags ?? []) as ModerationCategory[],
            status: payload.moderationStatus ?? ModerationStatus.PENDING,
            details: payload.details ?? {},
            requiresReview: false,
          },
          deliveryHash: this.buildDeliveryHash(serializedPayload),
          deliveryTimestamp: payload.timestamp,
          signatureValid: false,
          payloadMalformed: false,
          deliveryStale: true,
        });
      } catch (e) {
        this.logger.error('Failed to audit stale webhook', e as any);
      }

      throw new UnauthorizedException('Stale webhook delivery');
    }

    // ─── 4. Verify timestamped HMAC signature ──────────────────────────
    // The HMAC is computed over "<timestamp>.<payload>" binding timestamp to body
    if (
      !this.verifyTimestampedSignature(
        parsed.timestamp,
        serializedPayload,
        parsed.signature,
      )
    ) {
      this.auditReject(
        correlationId,
        payload,
        'invalid_signature',
        'HMAC signature verification failed',
      );
      throw new UnauthorizedException('Invalid signature');
    }

    // ─── 5. Validate payload structure ─────────────────────────────────
    if (!payload.confessionId || !payload.moderationStatus) {
      this.auditReject(
        correlationId,
        payload,
        'malformed_payload',
        'Missing required fields: confessionId or moderationStatus',
      );
      throw new BadRequestException(
        'Malformed payload: missing required fields',
      );
    }

    // ─── 6. Reject replayed event IDs ──────────────────────────────────
    if (!payload.eventId) {
      this.auditReject(
        correlationId,
        payload,
        'missing_event_id',
        'Missing eventId in payload',
      );
      throw new BadRequestException('Malformed payload: missing eventId');
    }

    this.evictStaleEventIds();
    if (this.processedEventIds.has(payload.eventId)) {
      this.auditReject(
        correlationId,
        payload,
        'replayed_event_id',
        `Event ${payload.eventId} already processed`,
      );
      this.logger.warn(
        `Rejected replayed moderation webhook event ${payload.eventId}`,
      );
      return {
        success: true,
        confessionId: payload.confessionId,
        status: payload.moderationStatus,
        isIdempotent: true,
      };
    }

    // ─── 7. Process the webhook ────────────────────────────────────────
    const requiresReview =
      payload.moderationStatus === ModerationStatus.FLAGGED;
    const shouldHide = payload.moderationStatus === ModerationStatus.REJECTED;
    const moderationResult: ModerationResult = {
      score: payload.moderationScore,
      flags: payload.moderationFlags as ModerationCategory[],
      status: payload.moderationStatus,
      details: payload.details,
      requiresReview,
    };
    const deliveryHash = this.buildDeliveryHash(serializedPayload);

    const result = await this.confessionRepo.manager.transaction(
      async (manager) => {
        const confessionRepo = manager.getRepository(AnonymousConfession);
        const confession = await confessionRepo.findOne({
          where: { id: payload.confessionId },
        });

        if (!confession) {
          return { status: 'not_found' as const };
        }

        const { isIdempotent } =
          await this.moderationRepoService.syncWebhookResult(
            {
              confessionId: confession.id,
              content: confession.message,
              result: moderationResult,
              deliveryHash,
              deliveryTimestamp: payload.timestamp,
              signatureValid: true,
              payloadMalformed: false,
            },
            manager,
          );

        if (isIdempotent) {
          return { status: 'idempotent' as const, confessionId: confession.id };
        }

        confession.moderationScore = payload.moderationScore;
        confession.moderationFlags = payload.moderationFlags;
        confession.moderationStatus = payload.moderationStatus;
        confession.moderationDetails = payload.details;
        confession.requiresReview = requiresReview;
        confession.isHidden = shouldHide;

        await confessionRepo.save(confession);

        return { status: 'processed' as const, confessionId: confession.id };
      },
    );

    if (result.status === 'not_found') {
      this.logger.error(`Confession ${payload.confessionId} not found`);
      return { success: false, error: 'Confession not found' };
    }

    if (result.status === 'idempotent') {
      this.logger.log(
        `Ignoring duplicate moderation webhook for confession ${payload.confessionId}`,
      );
      return {
        success: true,
        confessionId: result.confessionId,
        status: payload.moderationStatus,
        isIdempotent: true,
      };
    }

    // Mark event ID as processed
    this.processedEventIds.set(payload.eventId, Date.now());

    if (payload.moderationStatus === ModerationStatus.REJECTED) {
      this.eventEmitter.emit('moderation.high-severity', {
        confessionId: result.confessionId,
        score: payload.moderationScore,
        flags: payload.moderationFlags,
      });
    }

    if (payload.moderationStatus === ModerationStatus.FLAGGED) {
      this.eventEmitter.emit('moderation.requires-review', {
        confessionId: result.confessionId,
        score: payload.moderationScore,
        flags: payload.moderationFlags,
      });
    }

    this.logger.log(
      `Processed moderation webhook for confession ${payload.confessionId}`,
    );

    return {
      success: true,
      confessionId: result.confessionId,
      status: payload.moderationStatus,
      isIdempotent: false,
    };
  }

  /**
   * Builds a SHA-256 delivery hash for idempotency tracking.
   */
  private buildDeliveryHash(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verifies a timestamped HMAC signature.
   * The signed message is "<timestamp>.<payload>" to bind the timestamp
   * cryptographically to the request body, preventing timestamp tampering.
   */
  private verifyTimestampedSignature(
    timestamp: string,
    payload: string,
    signature: string,
  ): boolean {
    if (!this.webhookSecret || !signature) {
      return false;
    }

    const signedMessage = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedMessage)
      .digest('hex');

    if (signature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Evicts event IDs older than the TTL window to prevent unbounded memory growth.
   */
  private evictStaleEventIds(): void {
    const cutoff = Date.now() - this.eventIdTtlMs;
    for (const [eventId, ts] of this.processedEventIds) {
      if (ts < cutoff) {
        this.processedEventIds.delete(eventId);
      }
    }
  }

  /**
   * Logs a rejected webhook to the audit trail with redacted metadata.
   * Fire-and-forget: failures here must not break the rejection response.
   */
  private auditReject(
    correlationId: string,
    payload: WebhookPayload,
    reason: string,
    detail: string,
  ): void {
    this.logger.warn({
      event: 'moderation_webhook_rejected',
      correlationId,
      reason,
      confessionId: payload?.confessionId ?? 'unknown',
      eventId: payload?.eventId ?? 'unknown',
    });

    // Fire-and-forget audit log (redaction handled by AuditLogRedactionService)
    this.auditLogService
      .log({
        actionType: AuditActionType.WEBHOOK_REJECTED,
        metadata: {
          entityType: 'moderation_webhook',
          entityId: payload?.confessionId ?? 'unknown',
          confessionId: payload?.confessionId ?? 'unknown',
          eventId: payload?.eventId ?? 'unknown',
          reason,
          detail,
          actorType: 'webhook' as const,
          actorId: 'moderation-provider',
        },
        context: {
          requestId: correlationId,
          actor: {
            type: 'webhook' as const,
            id: 'moderation-provider',
            source: 'moderation-webhook',
          },
        },
      })
      .catch((err) => {
        this.logger.error('Failed to write webhook rejection audit log', err);
      });
  }
}
