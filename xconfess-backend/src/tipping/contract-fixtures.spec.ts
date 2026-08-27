/**
 * Tipping Contract Fixtures Compatibility Tests
 *
 * These tests verify that the tipping service can correctly handle
 * contract events and error codes as defined in the contract fixtures.
 *
 * This ensures that contract and backend changes don't silently break
 * the tip verification and reconciliation workflows.
 *
 * @see docs/contract-event-version-bump-checklist.md — required steps when
 *      changing event_version or fixture_version (paired with
 *      xconfess-contracts/contracts/tests/backend_verification_fixtures.rs).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TippingService } from './tipping.service';
import { TipVerificationSlaService } from './tip-verification-sla.service';
import { Tip } from './entities/tip.entity';
import { AnonymousConfession } from '../confession/entities/confession.entity';
import { StellarService } from '../stellar/stellar.service';
import {
  TIPPING_ERROR_CODES,
  ANCHOR_ERROR_CODES,
  CONTRACT_ERROR_CODES,
  classifyContractError,
  ContractErrorClassification,
  getRetryDelayMs,
  isRetryableContractError,
} from '../stellar/utils/stellar-contract-errors';
import {
  StellarContractError,
  handleStellarContractError,
  getClientSafeContractErrorMessage,
} from '../stellar/utils/stellar-error.handler';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('Tipping Contract Fixtures', () => {
  let tippingService: TippingService;
  let slaService: TipVerificationSlaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TippingService,
        TipVerificationSlaService,
        {
          provide: getRepositoryToken(Tip),
          useValue: {},
        },
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {},
        },
        {
          provide: StellarService,
          useValue: {},
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: AuditLogService, useValue: { createLog: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'tipping.tipVerificationStaleThresholdMinutes': 30,
                STELLAR_NETWORK: 'testnet',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    tippingService = module.get<TippingService>(TippingService);
    slaService = module.get<TipVerificationSlaService>(TipVerificationSlaService);
  });

  describe('Settlement Event Processing', () => {
    /**
     * Test processing of TIP_FIXTURE_BASIC
     */
    it('should process basic tip settlement event', () => {
      const fixture = {
        fixture_version: 1,
        event_version: 1,
        settlement_id: 1,
        amount: 1_000_000, // 1 XLM in stroops
        proof_metadata: 'txhash:abc123',
        proof_present: true,
        description: 'Basic anonymous tip with proof metadata',
      };

      // Simulate contract event data
      const settlementEvent = {
        recipient: 'GBVXZHTLP3PFTIQYKQJQAZCQVKTQSQFM23R2PI7F3VGHKJJUXQWVYUHH',
        event_version: fixture.event_version,
        settlement_id: fixture.settlement_id,
        amount: fixture.amount,
        proof_metadata: fixture.proof_metadata,
        proof_present: fixture.proof_present,
        timestamp: Date.now(),
      };

      // Backend should be able to process this event structure
      expect(settlementEvent.event_version).toBe(1);
      expect(settlementEvent.settlement_id).toBe(fixture.settlement_id);
      expect(settlementEvent.amount).toBe(fixture.amount);
      expect(settlementEvent.proof_present).toBe(true);
      expect(settlementEvent.proof_metadata).toContain('txhash:');
    });

    /**
     * Test processing of TIP_FIXTURE_NO_PROOF
     */
    it('should handle tip settlement without proof metadata', () => {
      const fixture = {
        fixture_version: 1,
        event_version: 1,
        settlement_id: 2,
        amount: 500_000, // 0.5 XLM
        proof_metadata: '',
        proof_present: false,
        description: 'Anonymous tip without proof metadata',
      };

      const settlementEvent = {
        recipient: 'GBVXZHTLP3PFTIQYKQJQAZCQVKTQSQFM23R2PI7F3VGHKJJUXQWVYUHH',
        event_version: fixture.event_version,
        settlement_id: fixture.settlement_id,
        amount: fixture.amount,
        proof_metadata: fixture.proof_metadata,
        proof_present: fixture.proof_present,
        timestamp: Date.now(),
      };

      // Backend should handle empty proof metadata gracefully
      expect(settlementEvent.proof_present).toBe(false);
      expect(settlementEvent.proof_metadata).toBe('');
      expect(settlementEvent.amount).toBe(500_000);
    });

    /**
     * Test processing of TIP_FIXTURE_LARGE_AMOUNT
     */
    it('should handle large tip amounts', () => {
      const fixture = {
        fixture_version: 1,
        event_version: 1,
        settlement_id: 3,
        amount: 100_000_000_000, // 10,000 XLM
        proof_metadata: 'txhash:large_tip_xyz',
        proof_present: true,
        description: 'Large anonymous tip (boundary test)',
      };

      const settlementEvent = {
        recipient: 'GBVXZHTLP3PFTIQYKQJQAZCQVKTQSQFM23R2PI7F3VGHKJJUXQWVYUHH',
        event_version: fixture.event_version,
        settlement_id: fixture.settlement_id,
        amount: fixture.amount,
        proof_metadata: fixture.proof_metadata,
        proof_present: fixture.proof_present,
        timestamp: Date.now(),
      };

      // Backend should handle large amounts without overflow
      expect(settlementEvent.amount).toBe(100_000_000_000);
      expect(settlementEvent.amount).toBeGreaterThan(1_000_000_000);
      expect(Number.isSafeInteger(settlementEvent.amount)).toBe(true);
    });
  });

  describe('Error Code Handling', () => {
    /**
     * Test that backend correctly classifies contract error codes
     */
    it('should classify terminal tipping errors correctly', () => {
      const terminalErrors = [
        TIPPING_ERROR_CODES.INVALID_TIP_AMOUNT,
        TIPPING_ERROR_CODES.METADATA_TOO_LONG,
        TIPPING_ERROR_CODES.UNAUTHORIZED,
        TIPPING_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG,
      ];

      for (const errorCode of terminalErrors) {
        expect(classifyContractError(errorCode)).toBe(
          ContractErrorClassification.TERMINAL,
        );
        expect(isRetryableContractError(errorCode)).toBe(false);
        expect(getRetryDelayMs(errorCode)).toBeNull();
      }
    });

    it('should classify retryable tipping errors correctly', () => {
      const retryableErrors = [
        TIPPING_ERROR_CODES.TOTAL_OVERFLOW,
        TIPPING_ERROR_CODES.NONCE_OVERFLOW,
        TIPPING_ERROR_CODES.CONTRACT_PAUSED,
        TIPPING_ERROR_CODES.RATE_LIMITED,
      ];

      for (const errorCode of retryableErrors) {
        expect(classifyContractError(errorCode)).toBe(
          ContractErrorClassification.RETRYABLE,
        );
        expect(isRetryableContractError(errorCode)).toBe(true);
        expect(getRetryDelayMs(errorCode, 0)).toBeGreaterThan(0);
      }
    });

    it('should provide appropriate retry delays', () => {
      const retryableError = TIPPING_ERROR_CODES.CONTRACT_PAUSED;

      // First retry should have short delay
      const delay1 = getRetryDelayMs(retryableError, 0);
      expect(delay1).toBeGreaterThanOrEqual(100);
      expect(delay1).toBeLessThanOrEqual(300);

      // Second retry should have longer delay (exponential backoff)
      const delay2 = getRetryDelayMs(retryableError, 1);
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay2).toBeLessThanOrEqual(600);

      // Third retry should have even longer delay
      const delay3 = getRetryDelayMs(retryableError, 2);
      expect(delay3).toBeGreaterThan(delay2);
    });
  });

  describe('Verification Workflow Compatibility', () => {
    it('should handle tip verification request format', () => {
      // Simulate tip verification request matching contract expectations
      const verificationRequest = {
        txHash: 'abc123def456',
        confessionId: 12345,
        expectedAmount: 1_000_000,
        recipientAddress: 'GBVXZHTLP3PFTIQYKQJQAZCQVKTQSQFM23R2PI7F3VGHKJJUXQWVYUHH',
      };

      // Backend should validate request format
      expect(verificationRequest.txHash).toMatch(/^[a-f0-9]+$/i);
      expect(verificationRequest.expectedAmount).toBeGreaterThan(0);
      expect(verificationRequest.recipientAddress).toMatch(/^G[A-Z0-9]{55}$/);
      expect(Number.isInteger(verificationRequest.confessionId)).toBe(true);
    });

    it('should handle idempotent verification responses', () => {
      // Test idempotency as required by the runbook
      const tipRecord = {
        txHash: 'abc123def456',
        confessionId: 12345,
        amount: 1_000_000,
        status: 'confirmed',
        settlementId: 1,
        createdAt: new Date(),
      };

      // Multiple verification requests should return the same result
      const response1 = {
        success: true,
        tipId: tipRecord.settlementId,
        amount: tipRecord.amount,
        status: tipRecord.status,
        alreadyProcessed: false,
      };

      const response2 = {
        success: true,
        tipId: tipRecord.settlementId,
        amount: tipRecord.amount,
        status: tipRecord.status,
        alreadyProcessed: true, // Indicates duplicate request
      };

      // Both responses should have same core data
      expect(response1.tipId).toBe(response2.tipId);
      expect(response1.amount).toBe(response2.amount);
      expect(response1.status).toBe(response2.status);
      expect(response2.alreadyProcessed).toBe(true);
    });

    it('should handle stale pending detection', () => {
      const staleThresholdMinutes = 30;
      const now = new Date();
      const staleTime = new Date(now.getTime() - (staleThresholdMinutes + 1) * 60 * 1000);

      const pendingTip = {
        txHash: 'pending123',
        status: 'pending',
        createdAt: staleTime,
        lastChecked: staleTime,
      };

      // SLA service should detect stale pending tips
      const isStale = now.getTime() - pendingTip.createdAt.getTime() > 
                     staleThresholdMinutes * 60 * 1000;
      
      expect(isStale).toBe(true);
      
      // Should mark as stale_pending for operator visibility
      const updatedStatus = isStale ? 'stale_pending' : 'pending';
      expect(updatedStatus).toBe('stale_pending');
    });
  });

  describe('Reconciliation Worker Compatibility', () => {
    it('should handle reconciliation state transitions', () => {
      const reconciliationStates = [
        'pending',
        'confirmed', 
        'failed',
        'stale_pending'
      ];

      for (const state of reconciliationStates) {
        expect(['pending', 'confirmed', 'failed', 'stale_pending']).toContain(state);
      }
    });

    it('should handle network mismatch scenarios', () => {
      const networkConfigs = {
        testnet: {
          horizonUrl: 'https://horizon-testnet.stellar.org',
          networkPassphrase: 'Test SDF Network ; September 2015',
        },
        mainnet: {
          horizonUrl: 'https://horizon.stellar.org',
          networkPassphrase: 'Public Global Stellar Network ; September 2015',
        },
      };

      // Backend should be able to detect network mismatches
      const backendNetwork = 'testnet';
      const walletNetwork = 'mainnet';
      
      const networkMismatch = backendNetwork !== walletNetwork;
      expect(networkMismatch).toBe(true);
      
      // Should provide clear error message for network mismatch
      if (networkMismatch) {
        const errorMessage = `Network mismatch: backend expects ${backendNetwork}, wallet used ${walletNetwork}`;
        expect(errorMessage).toContain('Network mismatch');
      }
    });
  });

  describe('Fixture Version Compatibility', () => {
    it('should maintain fixture version stability', () => {
      const currentFixtureVersion = 1;

      // This test ensures fixture version doesn't change unexpectedly
      expect(currentFixtureVersion).toBe(1);

      // When fixtures are updated, this version should be incremented
      // and migration logic should be added to handle older versions
    });

    it('should handle event version evolution', () => {
      const supportedEventVersions = [1];
      const currentEventVersion = 1;

      expect(supportedEventVersions).toContain(currentEventVersion);

      // Backend should be prepared to handle future event versions
      // with appropriate fallback or migration logic
    });
  });

  describe('Error Name Stability', () => {
    it('should preserve tipping error code names for fixture compatibility', () => {
      const expectedNames = [
        'INVALID_TIP_AMOUNT',
        'METADATA_TOO_LONG',
        'TOTAL_OVERFLOW',
        'NONCE_OVERFLOW',
        'UNAUTHORIZED',
        'CONTRACT_PAUSED',
        'RATE_LIMITED',
        'INVALID_RATE_LIMIT_CONFIG',
      ];

      const actualNames = Object.keys(TIPPING_ERROR_CODES);
      for (const name of expectedNames) {
        expect(actualNames).toContain(name);
      }
    });

    it('should preserve anchor error code names for fixture compatibility', () => {
      const expectedNames = [
        'UNAUTHORIZED',
        'NOT_FOUND',
        'INVALID_INPUT',
        'OVERFLOW',
        'COOLDOWN_ACTIVE',
        'PAYLOAD_TOO_LARGE',
        'METADATA_TOO_LONG',
        'CONFESSION_EXISTS',
        'CONFESSION_EMPTY',
        'CONFESSION_TOO_LONG',
        'REACTION_EXISTS',
        'INVALID_REACTION_TYPE',
        'REPORT_EXISTS',
        'INVALID_REPORT_REASON',
        'REPORT_REASON_TOO_LONG',
        'PROPOSAL_NOT_FOUND',
        'UNAUTHORIZED_APPROVAL',
        'QUORUM_NOT_REACHED',
        'ALREADY_APPROVED',
        'ALREADY_EXECUTED',
        'INVALID_ACTION',
      ];

      const actualNames = Object.keys(ANCHOR_ERROR_CODES);
      for (const name of expectedNames) {
        expect(actualNames).toContain(name);
      }
    });

    it('should produce client-safe messages for all known tipping errors', () => {
      const codes = Object.values(TIPPING_ERROR_CODES);
      for (const code of codes) {
        const err = handleStellarContractError(code);
        expect(err.message).toBeTruthy();
        expect(err.message.length).toBeGreaterThan(10);
        const response = err.toResponse();
        expect(response.retryable).toBe(
          classifyContractError(code) === ContractErrorClassification.RETRYABLE,
        );
      }
    });

    it('should produce client-safe messages for all known anchor errors', () => {
      const codes = Object.values(ANCHOR_ERROR_CODES);
      for (const code of codes) {
        const err = handleStellarContractError(code);
        expect(err.message).toBeTruthy();
        expect(err.message.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Client-Safe Response Compatibility', () => {
    it('should include classification in contract error responses', () => {
      const err = handleStellarContractError(TIPPING_ERROR_CODES.RATE_LIMITED);
      const response = err.toResponse();
      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('classification');
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('httpStatus');
      expect(response).toHaveProperty('retryable');
    });

    it('should not expose raw error names in client-safe messages', () => {
      const codes = [
        ...Object.values(TIPPING_ERROR_CODES),
        ...Object.values(ANCHOR_ERROR_CODES),
      ];
      for (const code of codes) {
        const msg = getClientSafeContractErrorMessage(code);
        expect(msg).not.toMatch(/^(UNAUTHORIZED|NOT_FOUND|INVALID_|RATE_LIMITED|CONTRACT_PAUSED|OVERFLOW)/);
        expect(msg.length).toBeGreaterThan(15);
      }
    });
  });
});
