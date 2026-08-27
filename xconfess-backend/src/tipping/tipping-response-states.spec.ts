import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TippingService } from './tipping.service';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { StellarService } from '../stellar/stellar.service';
import { VerifyTipDto } from './dto/verify-tip.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Issue #1687 — Anonymous tipping verification hardening.
 *
 * These tests cover the typed `state` outcome
 * (verified | duplicate | pending | stale | failed | conflict) that a
 * replayed (confession, tx) idempotency-key lookup now resolves to, based
 * on the *real* status of the matching row — rather than always returning a
 * blanket success for any matching row regardless of its status.
 */
describe('TippingService — typed response states (issue #1687)', () => {
  let service: TippingService;
  let tipRepository: Repository<Tip>;
  let confessionRepository: Repository<AnonymousConfession>;

  const confessionId = 'confession-1687';
  const txId = 'a'.repeat(64);
  const dto: VerifyTipDto = { txId };
  const mockConfession = { id: confessionId, content: 'test confession' };

  function makeExistingTip(overrides: Partial<Tip>): Tip {
    return {
      id: 'tip-1687',
      confessionId,
      txId,
      amount: 1.5,
      senderAddress: null,
      idempotencyKey: service['generateIdempotencyKey'](confessionId, txId),
      verificationStatus: TipVerificationStatus.VERIFIED,
      verifiedAt: new Date(),
      rejectionReason: null,
      retryCount: 0,
      lastChainStatus: 'verified',
      lastCheckedAt: new Date(),
      reconciliationMetadata: {},
      processingLock: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date(),
      ...overrides,
    } as Tip;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TippingService,
        {
          provide: getRepositoryToken(Tip),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn((value) => ({ id: 'tip-sentinel', ...value })),
            save: jest.fn((value) =>
              Promise.resolve({ id: value?.id || 'tip-sentinel', ...value }),
            ),
            update: jest.fn(),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn(() => ({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn(),
            })),
          },
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: StellarService,
          useValue: {
            verifyTransaction: jest.fn(),
            verifyTransactionFull: jest.fn(),
            getHorizonTxUrl: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: AuditLogService,
          useValue: { createLog: jest.fn(), log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TippingService>(TippingService);
    tipRepository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
    confessionRepository = module.get<Repository<AnonymousConfession>>(
      getRepositoryToken(AnonymousConfession),
    );

    jest
      .spyOn(confessionRepository, 'findOne')
      .mockResolvedValue(mockConfession as any);
  });

  it('VERIFIED replay → state "duplicate", 2xx-equivalent (no throw)', async () => {
    const existingTip = makeExistingTip({
      verificationStatus: TipVerificationStatus.VERIFIED,
    });
    jest
      .spyOn(service as any, 'findTipByIdempotencyKey')
      .mockResolvedValue(existingTip);

    const result = await service.verifyAndRecordTip(confessionId, dto);

    expect(result.state).toBe('duplicate');
    expect(result.isNew).toBe(false);
    expect(result.isIdempotent).toBe(true);
    expect(result.tip.id).toBe('tip-1687');
  });

  it('PENDING replay → typed ConflictException with state "pending", canRetry true', async () => {
    const existingTip = makeExistingTip({
      verificationStatus: TipVerificationStatus.PENDING,
    });
    jest
      .spyOn(service as any, 'findTipByIdempotencyKey')
      .mockResolvedValue(existingTip);

    await expect(
      service.verifyAndRecordTip(confessionId, dto),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        state: 'pending',
        canRetry: true,
      }),
    });
    await expect(
      service.verifyAndRecordTip(confessionId, dto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('STALE_PENDING replay → typed ConflictException with state "stale", canRetry true, and does NOT report success', async () => {
    const existingTip = makeExistingTip({
      verificationStatus: TipVerificationStatus.STALE_PENDING,
    });
    jest
      .spyOn(service as any, 'findTipByIdempotencyKey')
      .mockResolvedValue(existingTip);

    await expect(
      service.verifyAndRecordTip(confessionId, dto),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        state: 'stale',
        canRetry: true,
      }),
    });
  });

  it('REJECTED replay → typed BadRequestException with state "failed", canRetry false', async () => {
    const existingTip = makeExistingTip({
      verificationStatus: TipVerificationStatus.REJECTED,
      rejectionReason: 'Transaction not found or invalid on Stellar network',
    });
    jest
      .spyOn(service as any, 'findTipByIdempotencyKey')
      .mockResolvedValue(existingTip);

    await expect(
      service.verifyAndRecordTip(confessionId, dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.verifyAndRecordTip(confessionId, dto),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        state: 'failed',
        canRetry: false,
      }),
    });
  });

  it('CONFLICT replay → typed ConflictException with state "conflict", canRetry false', async () => {
    const existingTip = makeExistingTip({
      verificationStatus: TipVerificationStatus.CONFLICT,
    });
    jest
      .spyOn(service as any, 'findTipByIdempotencyKey')
      .mockResolvedValue(existingTip);

    await expect(
      service.verifyAndRecordTip(confessionId, dto),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        state: 'conflict',
        canRetry: false,
      }),
    });
  });

  it('different-confession guard → typed ConflictException carries state "conflict"', async () => {
    const originalConfessionId = 'other-confession';

    jest.spyOn(service as any, 'findTipByIdempotencyKey').mockResolvedValue(null);
    jest.spyOn(tipRepository, 'findOne').mockImplementation(({ where }: any) => {
      if (where?.txId === txId) {
        return Promise.resolve(
          makeExistingTip({ confessionId: originalConfessionId }),
        );
      }
      return Promise.resolve(null);
    });
    jest.spyOn(tipRepository, 'delete').mockResolvedValue({ affected: 1 } as any);

    await expect(
      service.verifyAndRecordTip(confessionId, dto),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        state: 'conflict',
        conflictReason: 'DIFFERENT_CONFESSION',
        originalConfessionId,
      }),
    });
  });
});
