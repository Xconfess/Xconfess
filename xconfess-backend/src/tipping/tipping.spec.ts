import { BadRequestException } from '@nestjs/common';
import { TippingService } from './tipping.service';
import { TipVerificationStatus } from './entities/tip.entity';
import { TipFactory } from '../../test/utils/factories/tip-factory';

describe('Tipping Service Tests with Seed Helpers', () => {
  let service: TippingService;
  let tipRepository: any;
  let confessionRepository: any;
  let stellarService: any;
  let eventEmitter: any;
  let auditLogService: any;

  beforeEach(() => {
    tipRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((value) => ({ ...value, id: 'tip-created' })),
      save: jest.fn((value) => Promise.resolve({ ...value, id: value.id || 'tip-created' })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      })),
    };
    tipRepository.manager = {
      transaction: jest.fn((callback) =>
        callback({ getRepository: jest.fn(() => tipRepository) }),
      ),
    };

    confessionRepository = {
      findOne: jest.fn(),
    };

    stellarService = {
      verifyTransaction: jest.fn(),
      getHorizonTxUrl: jest.fn().mockReturnValue('https://horizon.example/tx'),
    };
    eventEmitter = { emit: jest.fn() };
    auditLogService = { createLog: jest.fn(), log: jest.fn() };

    service = new TippingService(
      tipRepository,
      confessionRepository,
      stellarService,
      eventEmitter,
      auditLogService,
    );
  });

  it('creates factory tips with valid transaction shapes', () => {
    const pendingTip = TipFactory.buildPendingTip();
    const anonymousTip = TipFactory.buildAnonymousTip();
    const deterministicTip = TipFactory.buildDeterministic();

    expect(pendingTip.txId).toMatch(/^[a-f0-9]{64}$/i);
    expect(anonymousTip.senderAddress).toBeNull();
    expect(deterministicTip.id).toBe(TipFactory.buildDeterministic().id);
  });

  it('builds mixed factory tips for one confession', () => {
    const tips = TipFactory.buildMixedTipsForConfession('confession-1', 5);

    expect(tips).toHaveLength(5);
    tips.forEach((tip) => {
      expect(tip.confessionId).toBe('confession-1');
      expect(tip.amount).toBeGreaterThanOrEqual(0.1);
    });
  });

  it('gets tips and stats by confession id', async () => {
    const tips = [
      { amount: 1, confessionId: 'confession-1' },
      { amount: 2, confessionId: 'confession-1' },
    ];
    tipRepository.find.mockResolvedValue(tips);

    await expect(service.getTipsByConfessionId('confession-1')).resolves.toBe(
      tips,
    );
    await expect(service.getTipStats('confession-1')).resolves.toEqual({
      totalAmount: 3,
      totalCount: 2,
      averageAmount: 1.5,
    });
  });

  it('verifies and records a new tip using factory data', async () => {
    const pendingTip = TipFactory.buildPendingTip('confession-1');
    confessionRepository.findOne.mockResolvedValue({ id: 'confession-1' });
    tipRepository.findOne.mockResolvedValue(null);
    stellarService.verifyTransaction.mockResolvedValue(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        _embedded: {
          operations: [
            {
              type: 'payment',
              asset_type: 'native',
              amount: pendingTip.amount.toFixed(7),
              from: pendingTip.senderAddress,
            },
          ],
        },
      }),
    }) as any;

    const result = await service.verifyAndRecordTip('confession-1', {
      txId: pendingTip.txId,
    });

    expect(result.isNew).toBe(true);
    expect(result.isIdempotent).toBe(false);
    expect(result.tip).toMatchObject({
      confessionId: 'confession-1',
      txId: pendingTip.txId,
      verificationStatus: TipVerificationStatus.VERIFIED,
    });
  });

  it('records anonymous sender metadata for tips with anonymous_sender=true in memo', async () => {
    confessionRepository.findOne.mockResolvedValue({ id: 'confession-1' });
    tipRepository.findOne.mockResolvedValue(null);
    stellarService.verifyTransaction.mockResolvedValue(true);
    const anonymousTxId = 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        memo_type: 'text',
        memo: JSON.stringify({
          settlement_id: 'settlement-123',
          proof_metadata: 'proof-abc',
          anonymous_sender: true,
        }),
        _embedded: {
          operations: [
            {
              type: 'payment',
              asset_type: 'native',
              amount: '1.0000000',
              from: 'GFAKEFROMADDRESS1234567890EXAMPLE',
            },
          ],
        },
      }),
    }) as any;

    const result = await service.verifyAndRecordTip('confession-1', {
      txId: anonymousTxId,
    });

    expect(result.tip.senderAddress).toBeNull();
    expect(result.tip.reconciliationMetadata).toMatchObject({
      receiptMetadata: {
        settlementId: 'settlement-123',
        proofMetadata: 'proof-abc',
        anonymousSender: true,
      },
    });
  });

  it('rejects invalid on-chain transactions', async () => {
    const invalidTip = TipFactory.buildInvalidTip('confession-1');
    confessionRepository.findOne.mockResolvedValue({ id: 'confession-1' });
    tipRepository.findOne.mockResolvedValue(null);
    stellarService.verifyTransaction.mockResolvedValue(false);

    await expect(
      service.verifyAndRecordTip('confession-1', { txId: invalidTip.txId }),
    ).rejects.toThrow(BadRequestException);
  });
});
