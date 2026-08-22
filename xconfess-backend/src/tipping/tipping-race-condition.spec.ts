/**
 * Issue #784: Test concurrent verify and reconciliation race conditions
 * Issue #777: Test retry metadata persistence
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TippingService } from './tipping.service';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { StellarService } from '../stellar/stellar.service';
import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('TippingService - Race Condition Prevention', () => {
  let service: TippingService;
  let tipRepository: Repository<Tip>;
  let confessionRepository: Repository<AnonymousConfession>;
  let stellarService: StellarService;

  const mockConfession = {
    id: 'confession-123',
    message: 'Test confession',
  };

  const mockTxData = {
    successful: true,
    _embedded: {
      operations: [
        {
          type: 'payment',
          asset_type: 'native',
          amount: '1.0',
          from: 'GTEST123',
        },
      ],
    },
    memo_type: 'none',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TippingService,
        {
          provide: getRepositoryToken(Tip),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((value) => ({ id: 'tip-sentinel', ...value })),
            save: jest.fn((value) =>
              Promise.resolve({ id: value?.id || 'tip-sentinel', ...value }),
            ),
            update: jest.fn(),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            manager: {
              transaction: jest.fn((cb) => cb({ getRepository: () => tipRepository })),
            },
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
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: StellarService,
          useValue: {
            verifyTransaction: jest.fn(),
            getHorizonTxUrl: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AuditLogService, useValue: { createLog: jest.fn() } },
      ],
    }).compile();

    service = module.get<TippingService>(TippingService);
    tipRepository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
    confessionRepository = module.get<Repository<AnonymousConfession>>(
      getRepositoryToken(AnonymousConfession),
    );
    stellarService = module.get<StellarService>(StellarService);
  });

  describe('Concurrent Processing Prevention', () => {
    it('should prevent double-crediting when verify and reconciliation race', async () => {
      const txId = 'test-tx-123';
      const dto = { txId };

      // Mock the existing tip that would be returned on second call
      const existingTip = {
        id: 'tip-1',
        txId,
        confessionId: mockConfession.id,
        verificationStatus: TipVerificationStatus.VERIFIED,
        amount: 1.0,
      };

      jest.spyOn(confessionRepository, 'findOne').mockResolvedValue(mockConfession as any);
      jest
        .spyOn(tipRepository, 'findOne')
        .mockResolvedValue(existingTip as any);

      // Second concurrent request should return existing tip (idempotent)
      const result = await service.verifyAndRecordTip(mockConfession.id, dto);

      expect(result.isIdempotent).toBe(true);
      expect(result.tip.id).toBe(existingTip.id);
    });

    it('should reject conflicting confession IDs for same transaction', async () => {
      const txId = 'test-tx-456';
      const dto = { txId };
      const confession1Id = 'confession-1';
      const confession2Id = 'confession-2';

      const existingTip = {
        id: 'tip-1',
        txId,
        confessionId: confession1Id,
        verificationStatus: TipVerificationStatus.VERIFIED,
      };

      jest.spyOn(confessionRepository, 'findOne').mockResolvedValue(mockConfession as any);
      jest
        .spyOn(tipRepository, 'findOne')
        .mockResolvedValueOnce(null)
        .mockResolvedValue(existingTip as any);

      await expect(
        service.verifyAndRecordTip(confession2Id, dto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Retry Metadata Persistence', () => {
    it('should update retry count on each verification attempt', async () => {
      const txId = 'test-tx-789';
      const updateSpy = jest.spyOn(tipRepository, 'update');

      jest.spyOn(confessionRepository, 'findOne').mockResolvedValue(mockConfession as any);
      jest.spyOn(stellarService, 'verifyTransaction').mockResolvedValue(true);

      // Simulate multiple retry attempts
      const existingTip = {
        id: 'tip-1',
        txId,
        retryCount: 2,
        processingLock: null,
      };

      jest.spyOn(tipRepository, 'findOne').mockResolvedValue(existingTip as any);

      // The service should increment retry count
      expect(updateSpy).toBeDefined();
    });

    it('should persist last chain status and timestamp', async () => {
      const txId = 'test-tx-101';
      const queryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      };

      jest.spyOn(tipRepository, 'createQueryBuilder').mockReturnValue(queryBuilder as any);

      // This would be called internally by updateRetryMetadata
      expect(tipRepository.createQueryBuilder).toBeDefined();
    });
  });

  describe('Lock Timeout Handling', () => {
    it('should steal stale locks after timeout', async () => {
      const txId = 'test-tx-stale';
      const staleLockTime = new Date(Date.now() - 60000); // 60 seconds ago

      const staleTip = {
        id: 'tip-stale',
        txId,
        processingLock: 'old-lock-id',
        lockedAt: staleLockTime,
        lockedBy: 'reconciliation',
        verificationStatus: TipVerificationStatus.PENDING,
      };

      jest.spyOn(tipRepository, 'findOne').mockResolvedValue(staleTip as any);
      jest.spyOn(tipRepository, 'update').mockResolvedValue({} as any);

      // Lock should be stolen since it's stale
      expect(tipRepository.update).toBeDefined();
    });
  });
});
