import { BadRequestException } from '@nestjs/common';
import { SorobanEventCheckpointService } from './soroban-event-checkpoint.service';

describe('SorobanEventCheckpointService', () => {
  const contractId = `C${'A'.repeat(55)}`;

  function makeService() {
    const repository = {
      query: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    const analytics = {
      record: jest.fn().mockResolvedValue(null),
    };

    const service = new SorobanEventCheckpointService(
      repository as any,
      analytics as any,
    );

    return { service, repository, analytics };
  }

  it('records an indexed event checkpoint and privacy-safe analytics', async () => {
    const { service, repository, analytics } = makeService();

    await service.recordIndexedEvent({
      network: 'testnet',
      contractId,
      ledger: 12345,
      cursor: '12345-0000000001',
      txHash: 'a'.repeat(64),
    });

    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "soroban_event_checkpoints"'),
      ['testnet', contractId, 12345, '12345-0000000001'],
    );
    expect(analytics.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'soroban_event_indexed',
        network: 'testnet',
        txHash: 'a'.repeat(64),
        contractId,
        idempotencyKey: `soroban_event_indexed:${contractId}:12345:12345-0000000001`,
        metadata: {
          source: 'soroban_event_checkpoint',
          state: 'indexed',
        },
      }),
    );
  });

  it('rejects unsupported networks and malformed contract IDs', async () => {
    const { service } = makeService();

    await expect(
      service.recordIndexedEvent({
        network: 'futurenet' as any,
        contractId,
        ledger: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.recordIndexedEvent({
        network: 'testnet',
        contractId: 'not-a-contract',
        ledger: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsafe ledgers and oversized cursors', async () => {
    const { service } = makeService();

    await expect(
      service.recordIndexedEvent({
        network: 'testnet',
        contractId,
        ledger: -1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.recordIndexedEvent({
        network: 'testnet',
        contractId,
        ledger: 1,
        cursor: 'x'.repeat(257),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records sanitized failure state without raw error messages', async () => {
    const { service, repository } = makeService();

    await service.recordFailure({
      network: 'mainnet',
      contractId,
      errorCode: 'unsupported version: raw provider body',
    });

    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('failed_events'),
      ['mainnet', contractId, 'unsupported_version__raw_provider_body'],
    );
  });

  it('summarizes checkpoints without event payloads', async () => {
    const { service, repository } = makeService();
    repository.find.mockResolvedValue([
      {
        indexedEvents: 2,
        failedEvents: 1,
        lastIndexedAt: new Date('2026-09-05T10:00:00.000Z'),
        lastErrorAt: null,
      },
      {
        indexedEvents: 3,
        failedEvents: 4,
        lastIndexedAt: new Date('2026-09-05T11:00:00.000Z'),
        lastErrorAt: new Date('2026-09-05T12:00:00.000Z'),
      },
    ]);

    await expect(service.getSummary()).resolves.toEqual({
      checkpoints: 2,
      indexedEvents: 5,
      failedEvents: 5,
      lastIndexedAt: '2026-09-05T11:00:00.000Z',
      lastErrorAt: '2026-09-05T12:00:00.000Z',
    });
  });
});
