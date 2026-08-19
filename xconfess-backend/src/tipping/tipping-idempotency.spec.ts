import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TippingService } from './tipping.service';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { StellarService } from '../stellar/stellar.service';
import { VerifyTipDto } from './dto/verify-tip.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('TippingService - Issue #170: Idempotent Tip Verification', () => {
  let service: TippingService;
  let tipRepository: Repository<Tip>;
  let confessionRepository: Repository<AnonymousConfession>;
  let stellarService: StellarService;

  const mockConfessionId = 'confession-123';
  const mockTxId = 'a'.repeat(64);
  const mockConfession = {
    id: mockConfessionId,
    content: 'test confession',
  };

  const mockVerifyTipDto: VerifyTipDto = {
    txId: mockTxId,
  };

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
          useValue: {
            findOne: jest.fn(),
          },
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
  });

  describe('Idempotency Key Generation', () => {
    it('should generate consistent idempotency keys', () => {
      const key1 = service['generateIdempotencyKey'](mockConfessionId, mockTxId);
      const key2 = service['generateIdempotencyKey'](mockConfessionId, mockTxId);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA256 hex length
    });

    it('should generate different keys for different confessionIds', () => {
      const key1 = service['generateIdempotencyKey'](mockConfessionId, mockTxId);
      const key2 = service['generateIdempotencyKey']('different-confession', mockTxId);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different txIds', () => {
      const key1 = service['generateIdempotencyKey'](mockConfessionId, mockTxId);
      const key2 = service['generateIdempotencyKey'](
        mockConfessionId,
        'b'.repeat(64),
      );

      expect(key1).not.toBe(key2);
    });
  });

  describe('Replay-Safe Verification', () => {
    it('should return canonical response for duplicate idempotent requests', async () => {
      const existingTip: Tip = {
        id: 'tip-123',
        confessionId: mockConfessionId,
        txId: mockTxId,
        amount: 1.5,
        senderAddress: 'GXYZ...',
        idempotencyKey: service['generateIdempotencyKey'](mockConfessionId, mockTxId),
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
      };

      jest
        .spyOn(confessionRepository, 'findOne')
        .mockResolvedValue(mockConfession as any);
      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(existingTip);

      const result = await service.verifyAndRecordTip(
        mockConfessionId,
        mockVerifyTipDto,
      );

      expect(result.isIdempotent).toBe(true);
      expect(result.isNew).toBe(false);
      expect(result.tip.id).toBe('tip-123');
    });

    it('should detect conflict when txId used for different confession', async () => {
      const differentConfessionId = 'different-confession';
      const existingTip: Tip = {
        id: 'tip-123',
        confessionId: differentConfessionId,
        txId: mockTxId,
        amount: 1.5,
        senderAddress: 'GXYZ...',
        idempotencyKey: service['generateIdempotencyKey'](
          differentConfessionId,
          mockTxId,
        ),
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
      };

      jest
        .spyOn(confessionRepository, 'findOne')
        .mockResolvedValue(mockConfession as any);
      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(null);
      jest.spyOn(tipRepository, 'findOne').mockResolvedValue(existingTip);

      await expect(
        service.verifyAndRecordTip(mockConfessionId, mockVerifyTipDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Single-Credit Guarantee', () => {
    it('should not double-credit on repeated verification', async () => {
      const saveSpy = jest.spyOn(tipRepository, 'save');

      jest
        .spyOn(confessionRepository, 'findOne')
        .mockResolvedValue(mockConfession as any);
      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(null);
      jest.spyOn(tipRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(service as any, 'acquireProcessingLock')
        .mockResolvedValue({ success: true });
      jest
        .spyOn(stellarService, 'verifyTransaction')
        .mockResolvedValue(true);
      jest
        .spyOn(service as any, 'fetchTransactionData')
        .mockResolvedValue({
          _embedded: {
            operations: [
              {
                type: 'payment',
                asset_type: 'native',
                amount: '1.5',
                from: 'GXYZ...',
              },
            ],
          },
        });

      const newTip: Tip = {
        id: 'tip-123',
        confessionId: mockConfessionId,
        txId: mockTxId,
        amount: 1.5,
        senderAddress: 'GXYZ...',
        idempotencyKey: service['generateIdempotencyKey'](mockConfessionId, mockTxId),
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
      };

      saveSpy.mockResolvedValue(newTip);

      // First verification
      const result1 = await service.verifyAndRecordTip(
        mockConfessionId,
        mockVerifyTipDto,
      );
      expect(result1.isNew).toBe(true);

      // Second verification (idempotent replay)
      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(newTip);

      const result2 = await service.verifyAndRecordTip(
        mockConfessionId,
        mockVerifyTipDto,
      );

      expect(result2.isIdempotent).toBe(true);
      expect(result2.tip.id).toBe(newTip.id);
      // Initial verification creates a sentinel and finalizes it; replay does not save again.
      expect(saveSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling with Conflict Details', () => {
    it('should provide detailed conflict information', async () => {
      const existingTip: Tip = {
        id: 'tip-existing',
        confessionId: 'other-confession',
        txId: mockTxId,
        amount: 2.0,
        senderAddress: 'GABC...',
        idempotencyKey: 'other-key',
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
      };

      jest
        .spyOn(confessionRepository, 'findOne')
        .mockResolvedValue(mockConfession as any);
      jest
        .spyOn(service as any, 'findTipByIdempotencyKey')
        .mockResolvedValue(null);
      jest.spyOn(tipRepository, 'findOne').mockResolvedValue(existingTip);

      try {
        await service.verifyAndRecordTip(mockConfessionId, mockVerifyTipDto);
        fail('Should have thrown ConflictException');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
      }
    });
  });
});
