import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StellarService } from '../stellar.service';
import { StellarConfigService } from '../stellar-config.service';
import { TransactionBuilderService } from '../transaction-builder.service';
import { AnchorFactory } from '../../../test/utils/factories/anchor-factory';
import { DeploymentMetadataService } from '../services/deployment-metadata.service';
import { AnonymousConfession } from '../../confession/entities/confession.entity';

/**
 * Test suite for pending anchor states using seed helpers
 * 
 * These tests demonstrate the usage of AnchorFactory for creating
 * reproducible pending anchor scenarios without manual setup.
 */
describe('Anchor Pending States Tests', () => {
  let service: StellarService;
  let stellarConfig: StellarConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        StellarConfigService,
        TransactionBuilderService,
        {
          provide: DeploymentMetadataService,
          useValue: {
            getMetadata: jest.fn().mockReturnValue(null),
            getAllContractIds: jest.fn().mockReturnValue({}),
          },
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                STELLAR_NETWORK: 'testnet',
                STELLAR_SERVER_SECRET: 'SCXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                CONFESSION_ANCHOR_CONTRACT: 'CCHDY246UUPY6VUGIDVSK266KXA64CXM6RR2QLTKJD7E7IGV74ZP5XFB',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    stellarConfig = module.get<StellarConfigService>(StellarConfigService);
  });

  describe('Pending Anchor State Helpers', () => {
    it('should create a pending anchor confession using factory', () => {
      const pendingConfession = AnchorFactory.buildPendingAnchor();
      
      expect(pendingConfession).toBeDefined();
      expect(pendingConfession.stellarTxHash).toBeTruthy();
      expect(pendingConfession.stellarHash).toBeTruthy();
      expect(pendingConfession.isAnchored).toBe(false);
      expect(pendingConfession.anchoredAt).toBeNull();
      expect(pendingConfession.stellarTxHash).toMatch(/^[a-f0-9]{64}$/i);
    });

    it('should create a ready-for-anchoring confession using factory', () => {
      const readyConfession = AnchorFactory.buildReadyForAnchoring();
      
      expect(readyConfession).toBeDefined();
      expect(readyConfession.stellarTxHash).toBeNull();
      expect(readyConfession.stellarHash).toBeNull();
      expect(readyConfession.isAnchored).toBe(false);
      expect(readyConfession.anchoredAt).toBeNull();
    });

    it('should create a fully anchored confession using factory', () => {
      const anchoredConfession = AnchorFactory.buildAnchored();
      
      expect(anchoredConfession).toBeDefined();
      expect(anchoredConfession.stellarTxHash).toBeTruthy();
      expect(anchoredConfession.stellarHash).toBeTruthy();
      expect(anchoredConfession.isAnchored).toBe(true);
      expect(anchoredConfession.anchoredAt).toBeInstanceOf(Date);
    });

    it('should create mixed anchor states for comprehensive testing', () => {
      const mixedConfessions = AnchorFactory.buildMixedAnchorStates(10);
      
      expect(mixedConfessions).toHaveLength(10);
      
      const pendingCount = mixedConfessions.filter(c => !c.isAnchored && c.stellarTxHash).length;
      const anchoredCount = mixedConfessions.filter(c => c.isAnchored).length;
      const readyCount = mixedConfessions.filter(c => !c.stellarTxHash && !c.isAnchored).length;
      
      expect(pendingCount).toBeGreaterThan(0);
      expect(anchoredCount).toBeGreaterThan(0);
      expect(readyCount).toBeGreaterThan(0);
    });

    it('should create deterministic test data for reproducible tests', () => {
      const deterministic1 = AnchorFactory.buildDeterministic();
      const deterministic2 = AnchorFactory.buildDeterministic();
      
      expect(deterministic1.id).toBe(deterministic2.id);
      expect(deterministic1.message).toBe(deterministic2.message);
      expect(deterministic1.stellarTxHash).toBe(deterministic2.stellarTxHash);
      expect(deterministic1.stellarHash).toBe(deterministic2.stellarHash);
      expect(deterministic1.isAnchored).toBe(false);
    });
  });

  describe('Stellar Service Integration with Seed Helpers', () => {
    it('should validate transaction hash from pending anchor', () => {
      const pendingConfession = AnchorFactory.buildPendingAnchor();
      
      const isValid = service.isValidTxHash(pendingConfession.stellarTxHash);
      expect(isValid).toBe(true);
    });

    it('should process anchor data from pending confession', () => {
      const pendingConfession = AnchorFactory.buildPendingAnchor();
      
      const anchorData = service.processAnchorData(
        pendingConfession.message,
        pendingConfession.stellarTxHash,
        pendingConfession.created_at.getTime()
      );
      
      expect(anchorData).toBeDefined();
      expect(anchorData.stellarTxHash).toBe(pendingConfession.stellarTxHash);
      expect(anchorData.stellarHash).toBeTruthy();
      expect(anchorData.anchoredAt).toBeInstanceOf(Date);
    });

    it('should generate explorer URL for pending anchor transaction', () => {
      const pendingConfession = AnchorFactory.buildPendingAnchor();
      
      const explorerUrl = service.getExplorerUrl(pendingConfession.stellarTxHash);
      const horizonUrl = service.getHorizonTxUrl(pendingConfession.stellarTxHash);
      
      expect(explorerUrl).toContain(pendingConfession.stellarTxHash);
      expect(horizonUrl).toContain(pendingConfession.stellarTxHash);
      expect(explorerUrl).toContain('testnet');
    });

    it('should handle invalid transaction hash from failed anchor', () => {
      const failedConfession = AnchorFactory.buildFailedAnchor();
      failedConfession.stellarTxHash = 'invalid-hash';
      
      const isValid = service.isValidTxHash(failedConfession.stellarTxHash);
      expect(isValid).toBe(false);
      
      const anchorData = service.processAnchorData(
        failedConfession.message,
        failedConfession.stellarTxHash
      );
      expect(anchorData).toBeNull();
    });
  });

  describe('Anchor Workflow Testing with Helpers', () => {
    it('should simulate complete anchor workflow', () => {
      // Start with ready confession
      const readyConfession = AnchorFactory.buildReadyForAnchoring();
      expect(readyConfession.stellarTxHash).toBeNull();
      
      // Simulate transaction submission
      const pendingConfession = AnchorFactory.buildPendingAnchor({
        id: readyConfession.id,
        message: readyConfession.message,
      });
      expect(pendingConfession.stellarTxHash).toBeTruthy();
      expect(pendingConfession.isAnchored).toBe(false);
      
      // Simulate successful anchoring
      const anchoredConfession = AnchorFactory.buildAnchored({
        id: pendingConfession.id,
        message: pendingConfession.message,
        stellarTxHash: pendingConfession.stellarTxHash,
        stellarHash: pendingConfession.stellarHash,
      });
      expect(anchoredConfession.isAnchored).toBe(true);
      expect(anchoredConfession.anchoredAt).toBeInstanceOf(Date);
    });

    it('should test anchor state transitions', () => {
      const states = [
        AnchorFactory.buildReadyForAnchoring(),
        AnchorFactory.buildPendingAnchor(),
        AnchorFactory.buildAnchored(),
        AnchorFactory.buildFailedAnchor(),
      ];
      
      states.forEach((confession, index) => {
        expect(confession).toBeDefined();
        
        if (index === 0) { // Ready for anchoring
          expect(confession.stellarTxHash).toBeNull();
        } else if (index === 1) { // Pending
          expect(confession.stellarTxHash).toBeTruthy();
          expect(confession.isAnchored).toBe(false);
        } else if (index === 2) { // Anchored
          expect(confession.isAnchored).toBe(true);
          expect(confession.anchoredAt).toBeInstanceOf(Date);
        } else if (index === 3) { // Failed
          expect(confession.isAnchored).toBe(false);
        }
      });
    });
  });

  describe('Performance Testing with Seed Helpers', () => {
    it('should handle large batches of pending anchors efficiently', () => {
      const startTime = Date.now();
      const largeBatch = AnchorFactory.buildMixedAnchorStates(100);
      const endTime = Date.now();
      
      expect(largeBatch).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      
      const pendingCount = largeBatch.filter(c => !c.isAnchored && c.stellarTxHash).length;
      expect(pendingCount).toBeGreaterThan(20); // Reasonable distribution
    });

    it('should maintain consistency across multiple factory calls', () => {
      const batch1 = AnchorFactory.buildPendingAnchor();
      const batch2 = AnchorFactory.buildPendingAnchor();
      const batch3 = AnchorFactory.buildPendingAnchor();
      
      // All should have valid structure but different data
      expect(batch1.stellarTxHash).not.toBe(batch2.stellarTxHash);
      expect(batch2.stellarTxHash).not.toBe(batch3.stellarTxHash);
      expect(batch1.stellarTxHash).toMatch(/^[a-f0-9]{64}$/i);
      expect(batch2.stellarTxHash).toMatch(/^[a-f0-9]{64}$/i);
      expect(batch3.stellarTxHash).toMatch(/^[a-f0-9]{64}$/i);
    });
  });
});
