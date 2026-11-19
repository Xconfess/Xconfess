/**
 * Replay protection for moderation webhooks (bounded timestamps, unique event
 * IDs stored idempotently, safe rejection of stale/replayed events, retries).
 */
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { ModerationStatus } from './ai-moderation.service';
import { ModerationWebhookController } from './moderation-webhook.controller';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { FakeModerationWebhookEventStore } from '../../test/utils/moderation-webhook-event-store.fake';

const SECRET = 'replay-test-secret';

function sign(payload: unknown, offsetSeconds = 0, rawTimestamp?: string) {
  const timestamp =
    rawTimestamp ??
    Math.floor(Date.now() / 1000 + offsetSeconds).toString();
  const hmac = crypto
    .createHmac('sha256', SECRET)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventId: crypto.randomUUID(),
    confessionId: 'conf-1',
    moderationScore: 0.9,
    moderationFlags: ['spam'],
    moderationStatus: ModerationStatus.REJECTED,
    details: { spam: 0.9 },
    timestamp: new Date().toISOString(),
    ...overrides,
  } as any;
}

describe('ModerationWebhookController — replay protection', () => {
  let store: FakeModerationWebhookEventStore;
  let save: jest.Mock;
  let findOne: jest.Mock;
  let syncWebhookResult: jest.Mock;
  let auditLog: { log: jest.Mock };
  let emitter: { emit: jest.Mock };
  let config: Record<string, unknown>;

  const confession = () => ({
    id: 'conf-1',
    message: 'hello',
    moderationStatus: ModerationStatus.PENDING,
    isHidden: false,
  });

  const createController = () =>
    new ModerationWebhookController(
      { get: jest.fn((key: string, def?: unknown) => (key in config ? config[key] : def)) } as any,
      emitter as unknown as EventEmitter2,
      {
        manager: {
          transaction: jest.fn(async (work: (m: unknown) => Promise<unknown>) =>
            store.runInTransaction(
              { getRepository: () => ({ findOne, save }) },
              work,
            ),
          ),
        },
      } as any,
      { syncWebhookResult } as any,
      auditLog as any,
      store as any,
    );

  const rejectionReasons = () =>
    auditLog.log.mock.calls
      .filter(([entry]) => entry.actionType === AuditActionType.WEBHOOK_REJECTED)
      .map(([entry]) => entry.metadata.reason);

  beforeEach(() => {
    store = new FakeModerationWebhookEventStore();
    findOne = jest.fn().mockImplementation(async () => confession());
    save = jest.fn().mockImplementation(async (value) => value);
    syncWebhookResult = jest
      .fn()
      .mockResolvedValue({ log: { id: 'log' }, isIdempotent: false });
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    emitter = { emit: jest.fn() };
    config = { WEBHOOK_SECRET: SECRET, WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: 300 };
  });

  describe('signatures', () => {
    it('stores the processed event ID with the signed payload hash', async () => {
      const controller = createController();
      const payload = buildPayload();

      await expect(
        controller.handleModerationResults(payload, sign(payload)),
      ).resolves.toMatchObject({ success: true, isIdempotent: false });

      const expectedHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
      expect(store.committed.get(payload.eventId)).toBe(expectedHash);
      expect(store.claim).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventId: payload.eventId,
          confessionId: 'conf-1',
          signedAt: expect.any(Date),
        }),
      );
    });

    it('rejects an invalid signature before touching the event store', async () => {
      const controller = createController();
      const payload = buildPayload();
      const header = sign(payload).replace(/v1=.*/, `v1=${'0'.repeat(64)}`);

      await expect(
        controller.handleModerationResults(payload, header),
      ).rejects.toThrow(UnauthorizedException);
      expect(store.find).not.toHaveBeenCalled();
      expect(store.claim).not.toHaveBeenCalled();
    });

    it('rejects a payload signed with another secret', async () => {
      const controller = createController();
      const payload = buildPayload();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const forged = crypto
        .createHmac('sha256', 'attacker-secret')
        .update(`${timestamp}.${JSON.stringify(payload)}`)
        .digest('hex');

      await expect(
        controller.handleModerationResults(payload, `t=${timestamp},v1=${forged}`),
      ).rejects.toThrow(UnauthorizedException);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('bounded timestamps', () => {
    it('rejects stale deliveries outside the tolerance window', async () => {
      const controller = createController();
      const payload = buildPayload();

      await expect(
        controller.handleModerationResults(payload, sign(payload, -301)),
      ).rejects.toThrow(UnauthorizedException);
      expect(rejectionReasons()).toContain('stale_timestamp');
      expect(store.claim).not.toHaveBeenCalled();
    });

    it('rejects timestamps beyond the allowed clock skew in the future', async () => {
      const controller = createController();
      const payload = buildPayload();

      await expect(
        controller.handleModerationResults(payload, sign(payload, 120)),
      ).rejects.toThrow(UnauthorizedException);
      expect(rejectionReasons()).toContain('future_timestamp');
    });

    it('accepts small forward clock skew', async () => {
      const controller = createController();
      const payload = buildPayload();

      await expect(
        controller.handleModerationResults(payload, sign(payload, 30)),
      ).resolves.toMatchObject({ success: true });
    });

    it.each(['1e9', '12.5', '-100', '0x10', ''])(
      'rejects non-integer timestamp %p',
      async (raw) => {
        const controller = createController();
        const payload = buildPayload();
        const header = raw === '' ? sign(payload).replace(/t=\d+/, 't=') : sign(payload, 0, raw);

        await expect(
          controller.handleModerationResults(payload, header),
        ).rejects.toThrow(BadRequestException);
        expect(save).not.toHaveBeenCalled();
      },
    );

    it('clamps an oversized tolerance so the replay window stays bounded', async () => {
      config.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 86_400;
      const controller = createController();
      const payload = buildPayload();

      // 20 minutes old exceeds the 900s maximum even though 24h is configured.
      await expect(
        controller.handleModerationResults(payload, sign(payload, -1200)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('clamps a tiny tolerance up to the minimum window', async () => {
      config.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 1;
      const controller = createController();
      const payload = buildPayload();

      await expect(
        controller.handleModerationResults(payload, sign(payload, -20)),
      ).resolves.toMatchObject({ success: true });
    });
  });

  describe('unique event identifiers', () => {
    it.each([
      ['too long', 'a'.repeat(129)],
      ['unsafe characters', 'evt 1; DROP TABLE'],
      ['not a string', 12345],
    ])('rejects an eventId that is %s', async (_label, eventId) => {
      const controller = createController();
      const payload = buildPayload({ eventId });

      await expect(
        controller.handleModerationResults(payload, sign(payload)),
      ).rejects.toThrow(BadRequestException);
      expect(rejectionReasons()).toContain('invalid_event_id');
      expect(store.claim).not.toHaveBeenCalled();
    });

    it('accepts provider-style identifiers', async () => {
      const controller = createController();
      const payload = buildPayload({ eventId: 'evt_01HZX:moderation.result-1' });

      await expect(
        controller.handleModerationResults(payload, sign(payload)),
      ).resolves.toMatchObject({ success: true });
    });
  });

  describe('replays', () => {
    it('applies a replayed event only once, even when re-signed with a fresh timestamp', async () => {
      const controller = createController();
      const payload = buildPayload();

      await controller.handleModerationResults(payload, sign(payload, -100));
      const replay = await controller.handleModerationResults(payload, sign(payload));

      expect(replay).toMatchObject({ success: true, isIdempotent: true });
      expect(save).toHaveBeenCalledTimes(1);
      expect(syncWebhookResult).toHaveBeenCalledTimes(1);
      expect(emitter.emit).toHaveBeenCalledTimes(1);
      expect(rejectionReasons()).toContain('replayed_event_id');
    });

    it('rejects an event ID reused for a different payload', async () => {
      const controller = createController();
      const payload = buildPayload();
      await controller.handleModerationResults(payload, sign(payload));

      const tampered = { ...payload, moderationStatus: ModerationStatus.APPROVED };
      await expect(
        controller.handleModerationResults(tampered, sign(tampered)),
      ).rejects.toThrow(ConflictException);

      expect(save).toHaveBeenCalledTimes(1);
      expect(rejectionReasons()).toContain('event_id_conflict');
    });

    it('remembers processed events across instances and restarts', async () => {
      const payload = buildPayload();
      await createController().handleModerationResults(payload, sign(payload));

      const restarted = createController();
      await expect(
        restarted.handleModerationResults(payload, sign(payload)),
      ).resolves.toMatchObject({ isIdempotent: true });
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('treats a concurrent duplicate that wins the race as idempotent', async () => {
      const controller = createController();
      const payload = buildPayload();
      // Both deliveries pass the lock-free pre-check...
      store.find.mockResolvedValue(null);
      await controller.handleModerationResults(payload, sign(payload));

      // ...but the second claim inside the transaction sees the first row.
      const second = await controller.handleModerationResults(payload, sign(payload));
      expect(second).toMatchObject({ isIdempotent: true });
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('audit entries never contain the signature or payload body', async () => {
      const controller = createController();
      const payload = buildPayload();
      const header = sign(payload);
      await controller.handleModerationResults(payload, header);
      await controller.handleModerationResults(payload, header);

      const audited = JSON.stringify(auditLog.log.mock.calls);
      expect(audited).not.toContain(header.split('v1=')[1]);
      expect(audited).not.toContain(SECRET);
    });
  });

  describe('retries', () => {
    it('lets the provider retry after a failed delivery', async () => {
      const controller = createController();
      const payload = buildPayload();
      save.mockRejectedValueOnce(new Error('database blip'));

      await expect(
        controller.handleModerationResults(payload, sign(payload)),
      ).rejects.toThrow('database blip');
      expect(store.committed.has(payload.eventId)).toBe(false);

      await expect(
        controller.handleModerationResults(payload, sign(payload)),
      ).resolves.toMatchObject({ success: true, isIdempotent: false });
      expect(store.committed.has(payload.eventId)).toBe(true);
      expect(save).toHaveBeenCalledTimes(2);
    });

    it('does not record an event whose confession is missing, so it can be retried', async () => {
      const controller = createController();
      const payload = buildPayload();
      findOne.mockResolvedValueOnce(null);

      await expect(
        controller.handleModerationResults(payload, sign(payload)),
      ).resolves.toMatchObject({ success: false });
      expect(store.committed.has(payload.eventId)).toBe(false);

      await expect(
        controller.handleModerationResults(payload, sign(payload)),
      ).resolves.toMatchObject({ success: true, isIdempotent: false });
    });
  });

  describe('retention', () => {
    it('prunes expired event IDs at most once per interval and never fails the request', async () => {
      config.WEBHOOK_EVENT_RETENTION_HOURS = 24;
      const controller = createController();
      store.pruneOlderThan.mockRejectedValueOnce(new Error('prune failed'));

      const first = buildPayload();
      await expect(
        controller.handleModerationResults(first, sign(first)),
      ).resolves.toMatchObject({ success: true });
      const second = buildPayload();
      await controller.handleModerationResults(second, sign(second));

      expect(store.pruneOlderThan).toHaveBeenCalledTimes(1);
      const cutoff = store.pruneOlderThan.mock.calls[0][0] as unknown as Date;
      const ageHours = (Date.now() - cutoff.getTime()) / 3_600_000;
      expect(ageHours).toBeGreaterThan(23.9);
      expect(ageHours).toBeLessThan(24.1);
    });
  });
});
