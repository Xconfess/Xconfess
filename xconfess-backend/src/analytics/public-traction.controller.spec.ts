import { Test, TestingModule } from '@nestjs/testing';
import { PublicTractionController } from './public-traction.controller';
import { TractionMetricsService } from './traction-metrics.service';

describe('PublicTractionController', () => {
  it('returns public traction metrics without requiring auth guards', async () => {
    const metrics = {
      schemaVersion: 1,
      generatedAt: '2026-09-05T00:00:00.000Z',
      users: { totalRegistered: 0, dau: 0, wau: 0, mau: 0 },
      engagement: {
        confessionsCreated: 0,
        commentsCreated: 0,
        reactionsCreated: 0,
        messagesSent: 0,
      },
      stellar: {
        network: 'testnet',
        walletsConnected: 0,
        submittedTransactions: 0,
        confirmedTransactions: 0,
        failedTransactions: 0,
        successfulTips: 0,
        tipVolumeByAsset: {},
        sorobanEventsIndexed: 0,
        contracts: {
          confessionAnchorContractId: null,
          reputationBadgesContractId: null,
          tippingSystemContractId: null,
        },
      },
      reliability: { transactionSuccessRate: null },
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicTractionController],
      providers: [
        {
          provide: TractionMetricsService,
          useValue: { getPublicMetrics: jest.fn().mockResolvedValue(metrics) },
        },
      ],
    }).compile();

    const controller = module.get(PublicTractionController);

    await expect(controller.getTraction()).resolves.toEqual(metrics);
  });
});
