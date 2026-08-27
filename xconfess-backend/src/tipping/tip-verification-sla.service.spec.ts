import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, UpdateResult } from 'typeorm';
import { TipVerificationSlaService } from './tip-verification-sla.service';
import { Tip, TipVerificationStatus } from './entities/tip.entity';

describe('TipVerificationSlaService', () => {
  let service: TipVerificationSlaService;
  let mockTipRepository: jest.Mocked<Repository<Tip>>;

  beforeEach(async () => {
    mockTipRepository = {
      update: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TipVerificationSlaService,
        {
          provide: getRepositoryToken(Tip),
          useValue: mockTipRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(30),
          },
        },
      ],
    }).compile();

    service = module.get<TipVerificationSlaService>(TipVerificationSlaService);
  });

  describe('getEffectiveVerificationStatus', () => {
    it('should keep fresh pending tips as pending', () => {
      const now = new Date('2026-04-24T12:00:00.000Z');
      const tip = {
        verificationStatus: TipVerificationStatus.PENDING,
        createdAt: new Date('2026-04-24T11:45:01.000Z'),
      } as Tip;

      const status = service.getEffectiveVerificationStatus(tip, now);
      expect(status).toBe(TipVerificationStatus.PENDING);
    });

    it('should mark stale pending tips as stale_pending', () => {
      const now = new Date('2026-04-24T12:00:00.000Z');
      const tip = {
        verificationStatus: TipVerificationStatus.PENDING,
        createdAt: new Date('2026-04-24T11:20:00.000Z'),
      } as Tip;

      const status = service.getEffectiveVerificationStatus(tip, now);
      expect(status).toBe(TipVerificationStatus.STALE_PENDING);
    });

    it('should keep verified tips as verified', () => {
      const now = new Date('2026-04-24T12:00:00.000Z');
      const tip = {
        verificationStatus: TipVerificationStatus.VERIFIED,
        createdAt: new Date('2026-04-24T10:00:00.000Z'),
      } as Tip;

      const status = service.getEffectiveVerificationStatus(tip, now);
      expect(status).toBe(TipVerificationStatus.VERIFIED);
    });

    it('should keep rejected tips as rejected', () => {
      const now = new Date('2026-04-24T12:00:00.000Z');
      const tip = {
        verificationStatus: TipVerificationStatus.REJECTED,
        createdAt: new Date('2026-04-24T10:00:00.000Z'),
      } as Tip;

      const status = service.getEffectiveVerificationStatus(tip, now);
      expect(status).toBe(TipVerificationStatus.REJECTED);
    });
  });

  describe('markStalePendingTips', () => {
    it('should update pending tips older than the SLA threshold', async () => {
      const mockUpdateResult: UpdateResult = {
        affected: 2,
        raw: [],
        generatedMaps: [],
      };
      mockTipRepository.update.mockResolvedValue(mockUpdateResult);

      await service.markStalePendingTips();

      const [criteria, updatePayload] =
        mockTipRepository.update.mock.calls[0];

      expect(criteria).toEqual(
        expect.objectContaining({
          verificationStatus: TipVerificationStatus.PENDING,
        }),
      );
      expect((criteria as any).createdAt).toBeDefined();
      expect(updatePayload).toEqual({
        verificationStatus: TipVerificationStatus.STALE_PENDING,
      });
    });
  });
});
