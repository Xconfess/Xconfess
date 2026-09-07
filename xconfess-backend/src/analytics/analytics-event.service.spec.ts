import { ConfigService } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import { AnalyticsEventService } from './analytics-event.service';

const makeRepository = () => ({
  create: jest.fn((input) => ({ id: 'event-1', ...input })),
  save: jest.fn((event) => Promise.resolve(event)),
});

const makeConfig = (enabled = 'true') =>
  ({
    get: jest.fn((_key: string, fallback?: string) => enabled ?? fallback),
  }) as unknown as ConfigService;

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
      actorId: 'anon:abc',
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
