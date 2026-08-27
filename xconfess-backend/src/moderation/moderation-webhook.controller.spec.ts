import { UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { ModerationStatus } from './ai-moderation.service';
import { ModerationWebhookController } from './moderation-webhook.controller';

describe('ModerationWebhookController', () => {
  const webhookSecret = 'top-secret';
  let controller: ModerationWebhookController;
  let confessionRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: {
      transaction: jest.Mock;
    };
  };
  let moderationRepoService: {
    syncWebhookResult: jest.Mock;
  };
  let eventEmitter: {
    emit: jest.Mock;
  };
  let auditLogService: {
    log: jest.Mock;
  };

  const confession = {
    id: 'conf-123',
    message: 'example confession',
    moderationScore: 0,
    moderationFlags: [],
    moderationStatus: ModerationStatus.PENDING,
    moderationDetails: null,
    requiresReview: false,
    isHidden: false,
  } as any;

  /**
   * Builds a timestamped signature header: "t=<unix_ts>,v1=<hmac>"
   * HMAC computed over "<timestamp>.<serialized_payload>"
   */
  const buildSignature = (payload: unknown, secret = webhookSecret) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const serialized = JSON.stringify(payload);
    const signedMessage = `${timestamp}.${serialized}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(signedMessage)
      .digest('hex');
    return `t=${timestamp},v1=${hmac}`;
  };

  beforeEach(() => {
    const txFindOne = jest.fn().mockResolvedValue({ ...confession });
    const txSave = jest.fn().mockImplementation(async (value) => value);

    confessionRepo = {
      findOne: txFindOne,
      save: txSave,
      manager: {
        transaction: jest.fn(async (work) =>
          work({
            getRepository: jest.fn().mockReturnValue({
              findOne: txFindOne,
              save: txSave,
            }),
          }),
        ),
      },
    };
    moderationRepoService = {
      syncWebhookResult: jest
        .fn()
        .mockResolvedValue({ log: { id: 'log-1' }, isIdempotent: false }),
    };
    eventEmitter = {
      emit: jest.fn(),
    };
    auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    controller = new ModerationWebhookController(
      {
        get: jest.fn((key: string, def?: any) => {
          if (key === 'WEBHOOK_SECRET') return webhookSecret;
          if (key === 'WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS') return 300;
          return def;
        }),
      } as any,
      eventEmitter as unknown as EventEmitter2,
      confessionRepo as any,
      moderationRepoService as any,
      auditLogService as any,
    );
  });

  it('updates the confession and emits requires-review for flagged results', async () => {
    const payload = {
      eventId: crypto.randomUUID(),
      confessionId: 'conf-123',
      moderationScore: 0.71,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.71 },
      timestamp: new Date().toISOString(),
    };

    const result = await controller.handleModerationResults(
      payload,
      buildSignature(payload),
    );

    expect(moderationRepoService.syncWebhookResult).toHaveBeenCalledWith(
      expect.objectContaining({
        confessionId: 'conf-123',
        deliveryTimestamp: payload.timestamp,
        result: expect.objectContaining({
          status: ModerationStatus.FLAGGED,
          requiresReview: true,
        }),
      }),
      expect.anything(),
    );
    expect(confessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        moderationStatus: ModerationStatus.FLAGGED,
        requiresReview: true,
        isHidden: false,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'moderation.requires-review',
      expect.objectContaining({
        confessionId: 'conf-123',
        score: payload.moderationScore,
      }),
    );
    expect(result).toEqual({
      success: true,
      confessionId: 'conf-123',
      status: ModerationStatus.FLAGGED,
      isIdempotent: false,
    });
  });

  it('emits high-severity for rejected results', async () => {
    const payload = {
      eventId: crypto.randomUUID(),
      confessionId: 'conf-123',
      moderationScore: 0.99,
      moderationFlags: ['violence'],
      moderationStatus: ModerationStatus.REJECTED,
      details: { violence: 0.99 },
      timestamp: new Date().toISOString(),
    };

    await controller.handleModerationResults(payload, buildSignature(payload));

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'moderation.high-severity',
      expect.objectContaining({
        confessionId: 'conf-123',
        score: payload.moderationScore,
      }),
    );
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      'moderation.requires-review',
      expect.anything(),
    );
  });

  it('treats a duplicate delivery (same eventId) as idempotent and skips side effects', async () => {
    const payload = {
      eventId: crypto.randomUUID(),
      confessionId: 'conf-123',
      moderationScore: 0.71,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.71 },
      timestamp: new Date().toISOString(),
    };

    // First call processes normally
    const result1 = await controller.handleModerationResults(
      payload,
      buildSignature(payload),
    );
    expect(result1.isIdempotent).toBe(false);

    // Second call with same eventId — replayed
    const result2 = await controller.handleModerationResults(
      payload,
      buildSignature(payload),
    );
    expect(result2.isIdempotent).toBe(true);

    // Confession save should only happen once (first call)
    expect(confessionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rolls back staged webhook log updates when confession save fails', async () => {
    const payload = {
      eventId: crypto.randomUUID(),
      confessionId: 'conf-123',
      moderationScore: 0.85,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.85 },
      timestamp: new Date().toISOString(),
    };

    const committed = {
      moderationLogs: 0,
      isHidden: confession.isHidden,
    };

    confessionRepo.manager.transaction.mockImplementationOnce(async (work) => {
      let stagedLogCount = committed.moderationLogs;
      const stagedConfession = { ...confession };
      const txRepo = {
        findOne: jest.fn().mockResolvedValue(stagedConfession),
        save: jest
          .fn()
          .mockRejectedValue(new Error('Injected failure after log write')),
      };

      moderationRepoService.syncWebhookResult.mockImplementationOnce(
        async () => {
          stagedLogCount += 1;
          return { log: { id: 'log-rollback' }, isIdempotent: false };
        },
      );

      const value = await work({
        getRepository: jest.fn().mockReturnValue(txRepo),
      });
      committed.moderationLogs = stagedLogCount;
      committed.isHidden = stagedConfession.isHidden;
      return value;
    });

    await expect(
      controller.handleModerationResults(payload, buildSignature(payload)),
    ).rejects.toThrow('Injected failure after log write');

    expect(committed.moderationLogs).toBe(0);
    expect(committed.isHidden).toBe(false);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('rejects webhook requests with an invalid signature', async () => {
    const payload = {
      eventId: crypto.randomUUID(),
      confessionId: 'conf-123',
      moderationScore: 0.71,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.71 },
      timestamp: new Date().toISOString(),
    };

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const invalidHeader = `t=${timestamp},v1=${'f'.repeat(64)}`;

    await expect(
      controller.handleModerationResults(payload, invalidHeader),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects webhook requests with missing signature header', async () => {
    const payload = {
      eventId: crypto.randomUUID(),
      confessionId: 'conf-123',
      moderationScore: 0.71,
      moderationFlags: ['harassment'],
      moderationStatus: ModerationStatus.FLAGGED,
      details: { harassment: 0.71 },
      timestamp: new Date().toISOString(),
    };

    await expect(
      controller.handleModerationResults(payload, ''),
    ).rejects.toThrow(UnauthorizedException);
  });
});
