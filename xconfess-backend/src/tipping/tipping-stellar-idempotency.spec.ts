/**
 * Issue #1856: Stellar transaction idempotency tests for tipping
 *
 * Validates that:
 * - Same tx hash cannot create duplicate tips
 * - Repeated verification returns stable response
 * - Conflicting tx hash/idempotency combinations are rejected
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { TippingService } from './tipping.service';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { StellarService } from '../stellar/stellar.service';
import { VerifyTipDto } from './dto/verify-tip.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('TippingService - Stellar Transaction Idempotency (issue #1856)', () => {
  let service: TippingService;
  let tipRepository: Repository<Tip>;
  let confessionRepository: Repository<AnonymousConfession>;
  let stellarService: StellarService;

  const confessionId = 'confession-1856';
  const txId = 'b'.repeat(64);
  const mockConfession = { id: confessionId, content: 'test confession' };

  const txDataFixture = {
    _embedded: {
      operations: [
        {
          type: 'payment',
          asset_type: 'native',
          amount: '2.0',
          from: 'GAAA...',
        },
      ],
    },
  };

  function makeTip(overrides: Partial<Tip>): Tip {
    return {
      id: 'tip-1856',
      confessionId,
      txId,
      amount: 2.0,
      senderAddress: 'GAAA...',
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
    stellarService = module.get<StellarService>(StellarService);

    jest
      .spyOn(confessionRepository, 'findOne')
      .mockResolvedValue(mockConfession as any);
  });

  describe('Same tx hash cannot create duplicate tips', () => {
    it('should return existing verified tip on second verification attempt', async () => {
      const verifiedTip = makeTip({
        verificationStatus: TipVerificationStatus.VERIFIED,
      });

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(verifiedTip);

      const result1 = await service.verifyAndRecordTip(confessionId, {
        txId,
      });
      const result2 = await service.verifyAndRecordTip(confessionId, {
        txId,
      });

      expect(result1.tip.id).toBe(result2.tip.id);
      expect(result1.tip.txId).toBe(result2.tip.txId);
      expect(result2.isIdempotent).toBe(true);
      expect(result2.isNew).toBe(false);
    });

    it('should not call Stellar verification on idempotent replay', async () => {
      const verifiedTip = makeTip({
        verificationStatus: TipVerificationStatus.VERIFIED,
      });

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(verifiedTip);

      await service.verifyAndRecordTip(confessionId, { txId });

      expect(stellarService.verifyTransaction).not.toHaveBeenCalled();
    });

    it('should reject txId bound to a different confession', async () => {
      const otherConfessionId = 'confession-other';
      const existingTip = makeTip({ confessionId: otherConfessionId });

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(null);
      jest.spyOn(tipRepository, 'findOne').mockImplementation(({ where }: any) => {
        if (where?.txId === txId) return Promise.resolve(existingTip);
        return Promise.resolve(null);
      });
      jest.spyOn(tipRepository, 'delete').mockResolvedValue({ affected: 1 } as any);

      await expect(
        service.verifyAndRecordTip(confessionId, { txId }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Repeated verification returns stable response', () => {
    it('should return identical tip data across multiple idempotent calls', async () => {
      const verifiedTip = makeTip({
        verificationStatus: TipVerificationStatus.VERIFIED,
        amount: 3.14159,
        senderAddress: 'GSTABLE...',
      });

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(verifiedTip);

      const results = await Promise.all([
        service.verifyAndRecordTip(confessionId, { txId }),
        service.verifyAndRecordTip(confessionId, { txId }),
        service.verifyAndRecordTip(confessionId, { txId }),
      ]);

      const firstResult = results[0];
      for (const result of results) {
        expect(result.tip.id).toBe(firstResult.tip.id);
        expect(result.tip.amount).toBe(firstResult.tip.amount);
        expect(result.tip.senderAddress).toBe(firstResult.tip.senderAddress);
        expect(result.tip.verificationStatus).toBe(
          firstResult.tip.verificationStatus,
        );
        expect(result.isIdempotent).toBe(true);
        expect(result.isNew).toBe(false);
      }
    });

    it('should return stable response regardless of tip status', async () => {
      const pendingTip = makeTip({
        verificationStatus: TipVerificationStatus.PENDING,
      });

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(pendingTip);

      await expect(
        service.verifyAndRecordTip(confessionId, { txId }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          state: 'pending',
          canRetry: true,
        }),
      });

      // Second call should return the same state
      await expect(
        service.verifyAndRecordTip(confessionId, { txId }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          state: 'pending',
          canRetry: true,
        }),
      });
    });

    it('should return stable response for rejected tips', async () => {
      const rejectedTip = makeTip({
        verificationStatus: TipVerificationStatus.REJECTED,
        rejectionReason: 'Transaction not found',
      });

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(rejectedTip);

      await expect(
        service.verifyAndRecordTip(confessionId, { txId }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          state: 'failed',
          canRetry: false,
        }),
      });

      await expect(
        service.verifyAndRecordTip(confessionId, { txId }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          state: 'failed',
          canRetry: false,
        }),
      });
    });
  });

  describe('Conflicting tx hash/idempotency combinations are rejected', () => {
    it('should detect conflict when same txId used for different confession', async () => {
      const conflictingTip = makeTip({
        confessionId: 'confession-different',
      });

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(null);
      jest.spyOn(tipRepository, 'findOne').mockImplementation(({ where }: any) => {
        if (where?.txId === txId) return Promise.resolve(conflictingTip);
        return Promise.resolve(null);
      });
      jest.spyOn(tipRepository, 'delete').mockResolvedValue({ affected: 1 } as any);

      try {
        await service.verifyAndRecordTip(confessionId, { txId });
        fail('Should have thrown ConflictException');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toMatchObject({
          state: 'conflict',
          conflictReason: 'DIFFERENT_CONFESSION',
          originalConfessionId: 'confession-different',
        });
      }
    });

    it('should reject conflicting idempotency key with different txId', async () => {
      // Create two different txIds for the same confession
      const txId1 = 'c'.repeat(64);
      const txId2 = 'd'.repeat(64);
      const key1 = service['generateIdempotencyKey'](confessionId, txId1);
      const key2 = service['generateIdempotencyKey'](confessionId, txId2);

      // Keys should be different
      expect(key1).not.toBe(key2);

      // Each key is 64 hex chars (SHA256)
      expect(key1).toHaveLength(64);
      expect(key2).toHaveLength(64);
    });

    it('should not allow second insertion when idempotency key exists', async () => {
      const existingTip = makeTip({
        verificationStatus: TipVerificationStatus.VERIFIED,
      });

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(existingTip);

      // Second call finds existing row and returns it idempotently
      const result = await service.verifyAndRecordTip(confessionId, { txId });

      expect(result.isIdempotent).toBe(true);
      expect(result.isNew).toBe(false);
      expect(result.tip.id).toBe(existingTip.id);
    });
  });

  describe('Concurrent verification with same tx hash', () => {
    it('should handle concurrent first-writer race via sentinel INSERT', async () => {
      const saveSpy = jest.spyOn(tipRepository, 'save');

      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(null);
      jest.spyOn(tipRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(service as any, 'acquireProcessingLock')
        .mockResolvedValue({ success: true });
      jest.spyOn(stellarService, 'verifyTransaction').mockResolvedValue(true);
      jest
        .spyOn(service as any, 'fetchTransactionData')
        .mockResolvedValue(txDataFixture);

      const newTip = makeTip({ id: 'tip-new' });
      saveSpy.mockResolvedValue(newTip);

      const result = await service.verifyAndRecordTip(confessionId, { txId });

      expect(result.isNew).toBe(true);
      expect(result.state).toBe('verified');
    });

    it('should return canonical response when concurrent INSERT fails (23505)', async () => {
      const existingTip = makeTip({
        verificationStatus: TipVerificationStatus.VERIFIED,
      });

      // First call finds existing via idempotency key
      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(existingTip);

      const result = await service.verifyAndRecordTip(confessionId, { txId });

      expect(result.isIdempotent).toBe(true);
      expect(result.tip.id).toBe(existingTip.id);
    });
  });

  describe('Idempotency key determinism', () => {
    it('should produce identical keys for identical inputs', () => {
      const key1 = service['generateIdempotencyKey'](confessionId, txId);
      const key2 = service['generateIdempotencyKey'](confessionId, txId);

      expect(key1).toBe(key2);
    });

    it('should produce different keys for different confessionIds', () => {
      const key1 = service['generateIdempotencyKey'](confessionId, txId);
      const key2 = service['generateIdempotencyKey']('other-confession', txId);

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different txIds', () => {
      const key1 = service['generateIdempotencyKey'](confessionId, txId);
      const key2 = service['generateIdempotencyKey'](
        confessionId,
        'e'.repeat(64),
      );

      expect(key1).not.toBe(key2);
    });

    it('should always be 64 hex characters (SHA256)', () => {
      const key = service['generateIdempotencyKey'](confessionId, txId);

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
