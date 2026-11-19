import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Optional,
  Post,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
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
import { CacheService } from '../cache/cache.service';
import { ConfessionCacheKeys } from '../cache/cache-namespace';
import { ModerationWebhookEventStore } from './moderation-webhook-event.store';

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
 * Event identifiers must be bounded and unambiguous so they can be stored and
 * compared safely: 1-128 characters of letters, digits and `._:-`.
 */
const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Unix seconds, digits only (rejects "1e9", " 12", "12.5", ...). */
const UNIX_SECONDS_PATTERN = /^\d{1,12}$/;

/** Bounds for WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS. */
const MIN_TOLERANCE_SECONDS = 30;
const MAX_TOLERANCE_SECONDS = 900;
const DEFAULT_TOLERANCE_SECONDS = 300;

/** Signatures dated in the future are only accepted within this clock skew. */
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 60;

/** Processed event IDs are kept at least this long (and >= 2x tolerance). */
const DEFAULT_EVENT_RETENTION_HOURS = 72;
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;

function clampNumber(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/** SHA-256 HMACs are rendered as 64 lowercase/uppercase hex characters. */
const HMAC_SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Compares a supplied hex signature with the expected one in constant time.
 *
 * Both inputs are copied into equally sized buffers before
 * `crypto.timingSafeEqual` runs, so an attacker cannot learn the expected
 * signature length (or how many characters matched) from the comparison time.
 * The length equality check is folded into the result *after* the constant-time
 * comparison rather than returning early.
 */
function constantTimeSignatureEquals(
  provided: string,
  expected: string,
): boolean {
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const maxLength = Math.max(providedBuffer.length, expectedBuffer.length, 1);

  const providedPadded = Buffer.alloc(maxLength);
  const expectedPadded = Buffer.alloc(maxLength);
  providedBuffer.copy(providedPadded);
  expectedBuffer.copy(expectedPadded);

  const equal = crypto.timingSafeEqual(providedPadded, expectedPadded);
  return equal && providedBuffer.length === expectedBuffer.length;
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
  private readonly maxClockSkewSeconds: number;
  private readonly eventRetentionMs: number;
  private lastPruneAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(AnonymousConfession)
    private readonly confessionRepo: Repository<AnonymousConfession>,
    private readonly moderationRepoService: ModerationRepositoryService,
    private readonly auditLogService: AuditLogService,
    private readonly eventStore: ModerationWebhookEventStore,
    @Optional() private readonly cacheService?: CacheService,
  ) {
    this.webhookSecret = this.configService.get<string>('WEBHOOK_SECRET', '');
    // Bounded so a misconfiguration cannot open an unbounded replay window.
    this.timestampToleranceSeconds = clampNumber(
      this.configService.get('WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS'),
      DEFAULT_TOLERANCE_SECONDS,
      MIN_TOLERANCE_SECONDS,
      MAX_TOLERANCE_SECONDS,
    );
    this.maxClockSkewSeconds = Math.min(
      this.timestampToleranceSeconds,
      clampNumber(
        this.configService.get('WEBHOOK_MAX_CLOCK_SKEW_SECONDS'),
        DEFAULT_MAX_CLOCK_SKEW_SECONDS,
        0,
        MAX_TOLERANCE_SECONDS,
      ),
    );
    // Event IDs must outlive the window in which a signature is still fresh,
    // otherwise a captured delivery could be replayed after its row expired.
    const retentionHours = clampNumber(
      this.configService.get('WEBHOOK_EVENT_RETENTION_HOURS'),
      DEFAULT_EVENT_RETENTION_HOURS,
      1,
      24 * 90,
    );
    this.eventRetentionMs = Math.max(
      retentionHours * 3600 * 1000,
      this.timestampToleranceSeconds * 2 * 1000,
    );
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
    const sigTimestamp = UNIX_SECONDS_PATTERN.test(parsed.timestamp)
      ? Number(parsed.timestamp)
      : NaN;
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
    const skewSeconds = (sigTimestamp * 1000 - nowMs) / 1000;
    if (skewSeconds > this.maxClockSkewSeconds) {
      this.auditReject(
        correlationId,
        payload,
        'future_timestamp',
        `Webhook timestamp is ${Math.round(skewSeconds)}s in the future`,
      );
      throw new UnauthorizedException('Webhook timestamp is in the future');
    }

    const ageSeconds = (nowMs - sigTimestamp * 1000) / 1000;
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

    if (
      typeof payload.eventId !== 'string' ||
      !EVENT_ID_PATTERN.test(payload.eventId)
    ) {
      this.auditReject(
        correlationId,
        payload,
        'invalid_event_id',
        'eventId must be 1-128 characters of [A-Za-z0-9._:-]',
      );
      throw new BadRequestException('Malformed payload: invalid eventId');
    }

    const deliveryHash = this.buildDeliveryHash(serializedPayload);

    // Fast path: the event was already applied (provider retry or replay).
    const existing = await this.eventStore.find(payload.eventId);
    if (existing) {
      return this.handleAlreadyProcessed(
        correlationId,
        payload,
        existing.payloadHash === deliveryHash,
      );
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

    const result = await this.confessionRepo.manager.transaction(
      async (manager) => {
        const confessionRepo = manager.getRepository(AnonymousConfession);
        const confession = await confessionRepo.findOne({
          where: { id: payload.confessionId },
        });

        if (!confession) {
          // Nothing is recorded, so a retry after the confession exists works.
          return { status: 'not_found' as const };
        }

        // Claim the event in the same transaction as the update: it commits
        // only if the moderation result is applied, so failures stay retryable
        // and concurrent duplicates cannot both apply it.
        const claim = await this.eventStore.claim(manager, {
          eventId: payload.eventId,
          payloadHash: deliveryHash,
          confessionId: confession.id,
          signedAt: new Date(sigTimestamp * 1000),
        });
        if (claim === 'duplicate') return { status: 'duplicate' as const };
        if (claim === 'conflict') return { status: 'conflict' as const };

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

    if (result.status === 'duplicate' || result.status === 'conflict') {
      return this.handleAlreadyProcessed(
        correlationId,
        payload,
        result.status === 'duplicate',
      );
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

    this.schedulePrune();

    // Status and visibility just changed, so any cached copy is now stale.
    await this.cacheService?.del(
      ConfessionCacheKeys.single(result.confessionId),
    );
    await this.cacheService?.delPattern(ConfessionCacheKeys.listPrefix);

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
   *
   * The comparison itself is constant-time: malformed (non-hex / wrong-length)
   * signatures are rejected through a format flag rather than an early return,
   * so the time taken is independent of how close the supplied value is to the
   * expected signature.
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

    // The format check only inspects caller-supplied data; the expected value
    // is never used to short-circuit verification.
    const wellFormed = HMAC_SHA256_HEX_PATTERN.test(signature);
    const matches = constantTimeSignatureEquals(signature, expectedSignature);

    return wellFormed && matches;
  }

  /**
   * A previously applied event arrived again. The same payload is a provider
   * retry or a replay: acknowledge it without re-applying anything. A
   * different payload under the same event ID is rejected outright.
   */
  private handleAlreadyProcessed(
    correlationId: string,
    payload: WebhookPayload,
    samePayload: boolean,
  ) {
    if (!samePayload) {
      this.auditReject(
        correlationId,
        payload,
        'event_id_conflict',
        'eventId was already used for a different payload',
      );
      throw new ConflictException('eventId already used for a different payload');
    }

    this.auditReject(
      correlationId,
      payload,
      'replayed_event_id',
      'Event already processed',
    );
    this.logger.warn(
      `Ignored replayed moderation webhook event ${payload.eventId}`,
    );
    return {
      success: true,
      confessionId: payload.confessionId,
      status: payload.moderationStatus,
      isIdempotent: true,
    };
  }

  /**
   * Opportunistically delete expired event records, at most once per
   * PRUNE_INTERVAL_MS per instance. Never blocks or fails the request.
   */
  private schedulePrune(): void {
    const now = Date.now();
    if (now - this.lastPruneAt < PRUNE_INTERVAL_MS) return;
    this.lastPruneAt = now;
    this.eventStore
      .pruneOlderThan(new Date(now - this.eventRetentionMs))
      .catch((err) => {
        this.logger.error('Failed to prune moderation webhook events', err);
      });
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
