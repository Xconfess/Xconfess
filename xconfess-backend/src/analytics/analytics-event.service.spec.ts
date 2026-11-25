import { ConfigService } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import { AnalyticsEventService } from './analytics-event.service';

const makeRepository = () => ({
  create: jest.fn((input) => ({ id: 'event-1', ...input })),
  save: jest.fn((event) => Promise.resolve(event)),
});

const TEST_JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';

const makeConfig = (
  enabled = 'true',
  overrides: Record<string, string | undefined> = { JWT_SECRET: TEST_JWT_SECRET },
) =>
  ({
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'ANALYTICS_ENABLED') return enabled ?? fallback;
      return overrides[key] ?? fallback;
    }),
  }) as unknown as ConfigService;

const PSEUDONYM = /^(anon|user):p1_[0-9a-f]{32}$/;

describe('AnalyticsEventService', () => {
  it('records an allowlisted privacy-safe event', async () => {
    const repository = makeRepository();
    const service = new AnalyticsEventService(
      repository as any,
      makeConfig(),
    );

    const event = await service.record({
      eventName: 'confession_created',
      actorId: 'anon:abc',
      metadata: {
        source: 'confession_service',
        confessionId: 'confession-1',
        ignored: 'not persisted',
      },
    });

    expect(event).toMatchObject({
      eventName: 'confession_created',
      actorId: expect.stringMatching(PSEUDONYM),
      metadataJson: {
        source: 'confession_service',
        confessionId: 'confession-1',
      },
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects sensitive analytics metadata before persistence', async () => {
    const repository = makeRepository();
    const service = new AnalyticsEventService(
      repository as any,
      makeConfig(),
    );

    await expect(
      service.record({
        eventName: 'message_sent',
        actorId: 'anon:abc',
        metadata: {
          source: 'messages_service',
          content: 'private ciphertext or body must never be stored',
        },
      }),
    ).rejects.toThrow('sensitive field');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('returns null for duplicate idempotency inserts', async () => {
    const repository = makeRepository();
    const duplicate = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );
    (duplicate as any).code = '23505';
    repository.save.mockRejectedValueOnce(duplicate);
    const service = new AnalyticsEventService(
      repository as any,
      makeConfig(),
    );

    await expect(
      service.record({
        eventName: 'stellar_tx_confirmed',
        txHash: 'a'.repeat(64),
      }),
    ).resolves.toBeNull();
  });

  it('does not persist events when analytics is disabled', async () => {
    const repository = makeRepository();
    const service = new AnalyticsEventService(
      repository as any,
      makeConfig('false'),
    );

    await expect(
      service.record({ eventName: 'user_login', actorId: 'user:1' }),
    ).resolves.toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
  });
});

/**
 * Event inventory (Issue #2281). Each entry mirrors the payload shape used by
 * a production call site. The persisted payload must never contain the raw
 * identity identifier that was passed in.
 */
describe('AnalyticsEventService identity redaction', () => {
  const ANON_ID = '7c0d6f4e-5b1a-4c2d-9e8f-0a1b2c3d4e5f';
  const USER_ID = 98765;

  const inventory: Array<{
    site: string;
    input: Parameters<AnalyticsEventService['record']>[0];
    rawIdentifier?: string;
  }> = [
    {
      site: 'auth.service user_login',
      input: { eventName: 'user_login', actorId: `user:${USER_ID}`, metadata: { source: 'auth_service' } },
      rawIdentifier: String(USER_ID),
    },
    {
      site: 'user.service user_registered',
      input: {
        eventName: 'user_registered',
        actorId: `user:${USER_ID}`,
        idempotencyKey: 'user_registered:evt',
        metadata: { requestId: 'req-1', source: 'user_service' },
      },
      rawIdentifier: String(USER_ID),
    },
    {
      site: 'confession.service confession_created',
      input: {
        eventName: 'confession_created',
        actorId: `anon:${ANON_ID}`,
        metadata: { source: 'confession_service', confessionId: 'c-1' },
      },
      rawIdentifier: ANON_ID,
    },
    {
      site: 'comment.service comment_created',
      input: {
        eventName: 'comment_created',
        actorId: `anon:${ANON_ID}`,
        metadata: { source: 'comment_service', commentId: 1, confessionId: 'c-1' },
      },
      rawIdentifier: ANON_ID,
    },
    {
      site: 'reaction.service reaction_created',
      input: {
        eventName: 'reaction_created',
        actorId: `anon:${ANON_ID}`,
        metadata: { source: 'reaction_service', reactionId: 'r-1', confessionId: 'c-1' },
      },
      rawIdentifier: ANON_ID,
    },
    {
      site: 'messages.service message_sent',
      input: {
        eventName: 'message_sent',
        actorId: `anon:${ANON_ID}`,
        metadata: { source: 'messages_service', messageId: 5, confessionId: 'c-1' },
      },
      rawIdentifier: ANON_ID,
    },
    {
      site: 'tipping.service tip_completed (no actor)',
      input: {
        eventName: 'tip_completed',
        txHash: 'b'.repeat(64),
        assetCode: 'xlm',
        amountAtomic: '10000000',
        network: 'testnet',
        metadata: { source: 'tipping_service', tipId: 't-1', confessionId: 'c-1', requestId: null },
      },
    },
  ];

  it.each(inventory)('$site persists no raw identity identifier', async ({ input, rawIdentifier }) => {
    const repository = makeRepository();
    const service = new AnalyticsEventService(repository as any, makeConfig());

    const event = await service.record(input);
    const persisted = JSON.stringify(repository.save.mock.calls[0][0]);

    if (rawIdentifier) {
      expect(event?.actorId).toMatch(PSEUDONYM);
      expect(persisted).not.toContain(rawIdentifier);
    } else {
      expect(event?.actorId).toBeNull();
    }
  });

  it.each([
    'anonymousUserId',
    'anonymous_user_id',
    'anonymousContextId',
    'userId',
    'sessionId',
    'deviceId',
    'walletAddress',
  ])('rejects identity key %s in metadata without echoing its value', async (key) => {
    const repository = makeRepository();
    const service = new AnalyticsEventService(repository as any, makeConfig());

    const attempt = service.record({
      eventName: 'confession_created',
      metadata: { source: 'confession_service', [key]: ANON_ID },
    });

    await expect(attempt).rejects.toThrow(`sensitive field: metadata.${key}`);
    await attempt.catch((err: Error) => expect(err.message).not.toContain(ANON_ID));
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('drops the actor (but still records the event) when no pseudonym key exists', async () => {
    const repository = makeRepository();
    const service = new AnalyticsEventService(repository as any, makeConfig('true', {}));

    const event = await service.record({
      eventName: 'confession_created',
      actorId: `anon:${ANON_ID}`,
    });

    expect(event).not.toBeNull();
    expect(event?.actorId).toBeNull();
    expect(JSON.stringify(repository.save.mock.calls[0][0])).not.toContain(ANON_ID);
  });

  it('maps the same actor to the same pseudonym across events', async () => {
    const repository = makeRepository();
    const service = new AnalyticsEventService(repository as any, makeConfig());

    const a = await service.record({ eventName: 'confession_created', actorId: `anon:${ANON_ID}` });
    const b = await service.record({ eventName: 'comment_created', actorId: `anon:${ANON_ID}` });

    expect(a?.actorId).toBe(b?.actorId);
  });
});
