import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SorobanLifecycleService, TipSubmissionStatus } from './soroban-lifecycle.service';
import { Tip, TipVerificationStatus } from './entities/tip.entity';
import { StellarService } from '../stellar/stellar.service';

describe('SorobanLifecycleService', () => {
  let service: SorobanLifecycleService;
  let tipRepository: Repository<Tip>;
  let stellarService: StellarService;

  beforeEach(async () => {
    const mockTipRepository = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    };

    const mockStellarService = {
      verifyTransactionFull: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        SorobanLifecycleService,
        {
          provide: getRepositoryToken(Tip),
          useValue: mockTipRepository,
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
      ],
    }).compile();

    service = module.get<SorobanLifecycleService>(SorobanLifecycleService);
    tipRepository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
    stellarService = module.get<StellarService>(StellarService);
  });

  describe('recordSubmission', () => {
    it('should record tip submission with metadata', async () => {
      const tip = {
        id: 'tip-1',
        txId: 'tx-hash-1',
        confessionId: 'confession-1',
      } as Tip;

      const metadata = { sourceAddress: 'G123' };
      jest.spyOn(tipRepository, 'save').mockResolvedValue(tip);

      const result = await service.recordSubmission(tip, metadata);

      expect(result.submissionStatus).toBe(TipSubmissionStatus.SUBMITTED);
      expect(result.submittedAt).toBeDefined();
      expect(result.sorobanMetadata).toEqual(metadata);
    });
  });

  describe('recordConfirmation', () => {
    it('should record confirmation with ledger sequence', async () => {
      const tip = {
        id: 'tip-1',
        txId: 'tx-hash-1',
        submissionStatus: TipSubmissionStatus.SUBMITTED,
      } as Tip;

      jest.spyOn(tipRepository, 'save').mockResolvedValue(tip);

      const result = await service.recordConfirmation(tip, 12345678);

      expect(result.submissionStatus).toBe(TipSubmissionStatus.CONFIRMED);
      expect(result.confirmedAt).toBeDefined();
      expect(result.ledgerSequence).toBe(12345678);
      expect(result.verificationStatus).toBe('verified');
    });
  });

  describe('recordFailure', () => {
    it('should record failure with reason', async () => {
      const tip = {
        id: 'tip-1',
        txId: 'tx-hash-1',
        submissionStatus: TipSubmissionStatus.SUBMITTED,
      } as Tip;

      jest.spyOn(tipRepository, 'save').mockResolvedValue(tip);

      const reason = 'Insufficient balance';
      const result = await service.recordFailure(tip, reason);

      expect(result.submissionStatus).toBe(TipSubmissionStatus.FAILED);
      expect(result.failedAt).toBeDefined();
      expect(result.failureReason).toBe(reason);
      expect(result.verificationStatus).toBe('rejected');
    });
  });

  describe('recordExpiry', () => {
    it('should record transaction expiry', async () => {
      const tip = {
        id: 'tip-1',
        txId: 'tx-hash-1',
        submissionStatus: TipSubmissionStatus.SUBMITTED,
      } as Tip;

      jest.spyOn(tipRepository, 'save').mockResolvedValue(tip);

      const result = await service.recordExpiry(tip, 50000000);

      expect(result.submissionStatus).toBe(TipSubmissionStatus.EXPIRED);
      expect(result.failedAt).toBeDefined();
      expect(result.expiryBlockHeight).toBe(50000000);
      expect(result.failureReason).toContain('expired');
    });
  });

  describe('refreshConfirmation', () => {
    it('should refresh confirmation status from chain', async () => {
      const tip = {
        id: 'tip-1',
        txId: 'tx-hash-1',
        submissionStatus: TipSubmissionStatus.SUBMITTED,
      } as Tip;

      jest.spyOn(tipRepository, 'findOne').mockResolvedValue(tip);
      jest.spyOn(stellarService, 'verifyTransactionFull').mockResolvedValue({
        hash: 'tx-hash-1',
        success: true,
        ledger: 12345678,
        createdAt: new Date().toISOString(),
      } as any);

      jest.spyOn(service, 'recordConfirmation').mockResolvedValue(tip);

      const result = await service.refreshConfirmation('tx-hash-1');

      expect(result).toBeDefined();
    });

    it('should record failure if transaction failed on chain', async () => {
      const tip = {
        id: 'tip-1',
        txId: 'tx-hash-1',
        submissionStatus: TipSubmissionStatus.SUBMITTED,
      } as Tip;

      jest.spyOn(tipRepository, 'findOne').mockResolvedValue(tip);
      jest.spyOn(stellarService, 'verifyTransactionFull').mockResolvedValue({
        hash: 'tx-hash-1',
        success: false,
        ledger: 0,
      } as any);

      jest.spyOn(service, 'recordFailure').mockResolvedValue(tip);

      const result = await service.refreshConfirmation('tx-hash-1');

      expect(result).toBeDefined();
    });
  });

  describe('getTransactionTimeline', () => {
    it('should return timeline of transaction states', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            tipId: 'tip-1',
            txId: 'tx-1',
            status: TipSubmissionStatus.CONFIRMED,
            submittedAt: new Date(),
          },
        ]),
      };

      jest
        .spyOn(tipRepository, 'createQueryBuilder')
        .mockReturnValue(mockQuery as any);

      const result = await service.getTransactionTimeline('confession-1');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(TipSubmissionStatus.CONFIRMED);
    });
  });

  describe('getPendingConfirmations', () => {
    it('should return tips pending confirmation', async () => {
      const tips = [
        {
          id: 'tip-1',
          submissionStatus: TipSubmissionStatus.SUBMITTED,
        } as Tip,
      ];

      jest.spyOn(tipRepository, 'find').mockResolvedValue(tips);

      const result = await service.getPendingConfirmations();

      expect(result).toHaveLength(1);
      expect(result[0].submissionStatus).toBe(TipSubmissionStatus.SUBMITTED);
    });
  });

  describe('isExpired', () => {
    it('should detect expired transactions', async () => {
      const tip = {
        expiryBlockHeight: 50000000,
      } as Tip;

      const isExpired = await service.isExpired(tip, 50000001);
      expect(isExpired).toBe(true);
    });

    it('should return false for non-expired transactions', async () => {
      const tip = {
        expiryBlockHeight: 50000000,
      } as Tip;

      const isExpired = await service.isExpired(tip, 49999999);
      expect(isExpired).toBe(false);
    });
  });
});
