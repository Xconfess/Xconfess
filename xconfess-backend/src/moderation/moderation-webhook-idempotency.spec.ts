/**
 * Issue #41: Test moderation webhook idempotency, signature safety, and audit logging
 *
 * Acceptance Criteria:
 * - Unsigned, stale, malformed, and replayed webhooks fail.
 * - Valid webhook is processed once.
 * - Failure logs are redacted and correlated.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ModerationWebhookController } from './moderation-webhook.controller';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { ModerationRepositoryService } from './moderation-repository.service';
import { ModerationStatus } from './ai-moderation.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('ModerationWebhookController - Idempotency and Signature Safety', () => {
  let controller: ModerationWebhookController;
  let confessionRepo: Repository<AnonymousConfession>;
  let moderationRepoService: ModerationRepositoryService;
  let auditLogService: { log: jest.Mock };

  const mockWebhookSecret = 'test-webhook-secret';

  const buildPayload = (overrides: Record<string, any> = {}) => ({
    eventId: crypto.randomUUID(),
    confessionId: 'confession-123',
    moderationScore: 0.85,
    moderationFlags: ['spam'],
    moderationStatus: ModerationStatus.FLAGGED,
    details: { spam: 0.85 },
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  /**
   * Builds a timestamped signature header in the format:
   * "t=<unix_seconds>,v1=<hmac_hex>"
   * where HMAC is computed over "<timestamp>.<serialized_payload>"
   */
  const buildSignatureHeader = (
    payload: unknown,
    secret = mockWebhookSecret,
  ) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const serialized = JSON.stringify(payload);
    const signedMessage = `${timestamp}.${serialized}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(signedMessage)
      .digest('hex');
    return `t=${timestamp},v1=${hmac}`;
  };

  /** Builds a stale signature header (timestamp too old) */
  const buildStaleSignatureHeader = (
    payload: unknown,
    secret = mockWebhookSecret,
  ) => {
    const timestamp = Math.floor((Date.now() - 600_000) / 1000).toString(); // 10 minutes ago
    const serialized = JSON.stringify(payload);
    const signedMessage = `${timestamp}.${serialized}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(signedMessage)
      .digest('hex');
    return `t=${timestamp},v1=${hmac}`;
  };

  beforeEach(async () => {
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModerationWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'WEBHOOK_SECRET') return mockWebhookSecret;
              if (key === 'WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS') return 300;
              return defaultValue;
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            manager: { transaction: jest.fn() },
          },
        },
        {
          provide: ModerationRepositoryService,
          useValue: { syncWebhookResult: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: auditLogService,
        },
      ],
    }).compile();

    controller = module.get<ModerationWebhookController>(
      ModerationWebhookController,
    );
    confessionRepo = module.get<Repository<AnonymousConfession>>(
      getRepositoryToken(AnonymousConfession),
    );
    moderationRepoService = module.get<ModerationRepositoryService>(
      ModerationRepositoryService,
    );
  });

  describe('Signature Validation', () => {
    it('should reject requests with missing signature (unsigned)', async () => {
      const payload = buildPayload();
      await expect(
        controller.handleModerationResults(payload, ''),
      ).rejects.toThrow(UnauthorizedException);

      // Audit log should be written
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.WEBHOOK_REJECTED,
          metadata: expect.objectContaining({ reason: 'missing_signature' }),
        }),
      );
    });

    it('should reject requests with malformed signature header', async () => {
      const payload = buildPayload();
      await expect(
        controller.handleModerationResults(payload, 'garbage-header-no-format'),
      ).rejects.toThrow(BadRequestException);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.WEBHOOK_REJECTED,
          metadata: expect.objectContaining({
            reason: 'malformed_signature_header',
          }),
        }),
      );
    });

    it('should reject requests with invalid HMAC signature', async () => {
      const payload = buildPayload();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const invalidHeader = `t=${timestamp},v1=${'a'.repeat(64)}`;

      await expect(
        controller.handleModerationResults(payload, invalidHeader),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.WEBHOOK_REJECTED,
          metadata: expect.objectContaining({ reason: 'invalid_signature' }),
        }),
      );
    });

    it('should reject signature computed without timestamp binding (forged)', async () => {
      const payload = buildPayload();
      // Attacker computes HMAC over payload only (old scheme) — should fail
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const forgedHmac = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');
      const forgedHeader = `t=${timestamp},v1=${forgedHmac}`;

      await expect(
        controller.handleModerationResults(payload, forgedHeader),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject stale but correctly signed requests and audit them', async () => {
      const payload = buildPayload();
      const staleHeader = buildStaleSignatureHeader(payload);

      jest.spyOn(moderationRepoService, 'syncWebhookResult').mockResolvedValue({
        log: {} as any,
        isIdempotent: false,
      });

      await expect(
        controller.handleModerationResults(payload, staleHeader),
      ).rejects.toThrow(UnauthorizedException);

      // Audit stale webhook
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.WEBHOOK_REJECTED,
          metadata: expect.objectContaining({ reason: 'stale_timestamp' }),
        }),
      );
      // Moderation repo should also record stale delivery
      expect(moderationRepoService.syncWebhookResult).toHaveBeenCalledWith(
        expect.objectContaining({ deliveryStale: true }),
      );
    });

    it('should accept requests with valid timestamped signature', async () => {
      const payload = buildPayload();
      const validHeader = buildSignatureHeader(payload);

      const mockConfession = {
        id: payload.confessionId,
        message: 'Test confession',
      };

      jest
        .spyOn(confessionRepo.manager, 'transaction')
        .mockImplementation(async (cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn().mockResolvedValue(mockConfession),
              save: jest.fn().mockResolvedValue(mockConfession),
            }),
          };
          return cb(manager);
        });

      jest.spyOn(moderationRepoService, 'syncWebhookResult').mockResolvedValue({
        log: {} as any,
        isIdempotent: false,
      });

      const result = await controller.handleModerationResults(
        payload,
        validHeader,
      );

      expect(result.success).toBe(true);
      expect(result.isIdempotent).toBe(false);
      // No rejection audit log for valid requests
      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });

  describe('Payload Validation', () => {
    it('should reject malformed payloads missing required fields', async () => {
      const malformedPayload = {
        eventId: crypto.randomUUID(),
        moderationScore: 0.5,
        timestamp: new Date().toISOString(),
      } as any;

      const validHeader = buildSignatureHeader(malformedPayload);

      await expect(
        controller.handleModerationResults(malformedPayload, validHeader),
      ).rejects.toThrow(BadRequestException);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.WEBHOOK_REJECTED,
          metadata: expect.objectContaining({ reason: 'malformed_payload' }),
        }),
      );
    });

    it('should reject payloads missing eventId', async () => {
      const payload = {
        confessionId: 'confession-123',
        moderationScore: 0.85,
        moderationFlags: ['spam'],
        moderationStatus: ModerationStatus.FLAGGED,
        details: { spam: 0.85 },
        timestamp: new Date().toISOString(),
      } as any;

      const validHeader = buildSignatureHeader(payload);

      await expect(
        controller.handleModerationResults(payload, validHeader),
      ).rejects.toThrow(BadRequestException);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.WEBHOOK_REJECTED,
          metadata: expect.objectContaining({ reason: 'missing_event_id' }),
        }),
      );
    });
  });

  describe('Replay Prevention', () => {
    it('should reject replayed event IDs on second delivery', async () => {
      const payload = buildPayload();
      const validHeader = buildSignatureHeader(payload);

      const mockConfession = {
        id: payload.confessionId,
        message: 'Test confession',
      };

      jest
        .spyOn(confessionRepo.manager, 'transaction')
        .mockImplementation(async (cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn().mockResolvedValue(mockConfession),
              save: jest.fn().mockResolvedValue(mockConfession),
            }),
          };
          return cb(manager);
        });

      jest.spyOn(moderationRepoService, 'syncWebhookResult').mockResolvedValue({
        log: {} as any,
        isIdempotent: false,
      });

      // First delivery — processed
      const result1 = await controller.handleModerationResults(
        payload,
        validHeader,
      );
      expect(result1.success).toBe(true);
      expect(result1.isIdempotent).toBe(false);

      // Second delivery with same eventId — replayed
      const result2 = await controller.handleModerationResults(
        payload,
        validHeader,
      );
      expect(result2.isIdempotent).toBe(true);

      // Audit log for replay rejection
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: AuditActionType.WEBHOOK_REJECTED,
          metadata: expect.objectContaining({ reason: 'replayed_event_id' }),
        }),
      );
    });

    it('should not create duplicate moderation logs for replayed webhooks', async () => {
      const payload = buildPayload();
      const validHeader = buildSignatureHeader(payload);

      const mockConfession = {
        id: payload.confessionId,
        message: 'Test confession',
      };

      jest
        .spyOn(confessionRepo.manager, 'transaction')
        .mockImplementation(async (cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn().mockResolvedValue(mockConfession),
              save: jest.fn().mockResolvedValue(mockConfession),
            }),
          };
          return cb(manager);
        });

      jest.spyOn(moderationRepoService, 'syncWebhookResult').mockResolvedValue({
        log: {} as any,
        isIdempotent: false,
      });

      // First call processes
      await controller.handleModerationResults(payload, validHeader);

      // Second call with same eventId is blocked before reaching syncWebhookResult again
      const syncCallCount = (
        moderationRepoService.syncWebhookResult as jest.Mock
      ).mock.calls.length;
      await controller.handleModerationResults(payload, validHeader);
      expect(
        (moderationRepoService.syncWebhookResult as jest.Mock).mock.calls
          .length,
      ).toBe(syncCallCount);
    });
  });

  describe('Idempotency (delivery hash)', () => {
    it('should return idempotent response for duplicate webhook deliveries', async () => {
      const payload = buildPayload();
      const validHeader = buildSignatureHeader(payload);

      const mockConfession = {
        id: payload.confessionId,
        message: 'Test confession',
      };

      jest
        .spyOn(confessionRepo.manager, 'transaction')
        .mockImplementation(async (cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn().mockResolvedValue(mockConfession),
              save: jest.fn().mockResolvedValue(mockConfession),
            }),
          };
          return cb(manager);
        });

      // First call - not idempotent
      jest
        .spyOn(moderationRepoService, 'syncWebhookResult')
        .mockResolvedValueOnce({
          log: {} as any,
          isIdempotent: false,
        });

      const result1 = await controller.handleModerationResults(
        payload,
        validHeader,
      );
      expect(result1.isIdempotent).toBe(false);

      // Second call with same payload but different eventId - idempotent via delivery hash
      const payload2 = { ...payload, eventId: crypto.randomUUID() };
      const validHeader2 = buildSignatureHeader(payload2);

      jest
        .spyOn(confessionRepo.manager, 'transaction')
        .mockImplementation(async (cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn().mockResolvedValue(mockConfession),
              save: jest.fn().mockResolvedValue(mockConfession),
            }),
          };
          return cb(manager);
        });

      jest
        .spyOn(moderationRepoService, 'syncWebhookResult')
        .mockResolvedValueOnce({
          log: {} as any,
          isIdempotent: true,
        });

      const result2 = await controller.handleModerationResults(
        payload2,
        validHeader2,
      );
      expect(result2.isIdempotent).toBe(true);
    });
  });

  describe('Audit Log Correlation', () => {
    it('should include correlation ID (requestId) in rejection audit logs', async () => {
      const payload = buildPayload();

      await expect(
        controller.handleModerationResults(payload, ''),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            requestId: expect.any(String),
          }),
        }),
      );
    });

    it('should include webhook actor metadata in rejection audit logs', async () => {
      const payload = buildPayload();

      await expect(
        controller.handleModerationResults(payload, ''),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            actorType: 'webhook',
            actorId: 'moderation-provider',
          }),
        }),
      );
    });
  });

  describe('Confession Not Found', () => {
    it('should handle missing confession gracefully', async () => {
      const payload = buildPayload();
      const validHeader = buildSignatureHeader(payload);

      jest
        .spyOn(confessionRepo.manager, 'transaction')
        .mockImplementation(async (cb: any) => {
          const manager = {
            getRepository: () => ({
              findOne: jest.fn().mockResolvedValue(null),
            }),
          };
          return cb(manager);
        });

      const result = await controller.handleModerationResults(
        payload,
        validHeader,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Confession not found');
    });
  });
});
