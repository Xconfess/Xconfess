import { ConfigService } from '@nestjs/config';
import { StellarConfigService } from './stellar-config.service';
import { DeploymentMetadataService } from './services/deployment-metadata.service';

/**
 * Contract ID allowlist-by-network validation (issue #1483).
 *
 * A wrong contract ID could route confession anchors, reputation badges,
 * or tips to an unintended contract, so mismatches between the configured
 * network and its deployment metadata must fail boot rather than silently
 * using the wrong contract.
 */
describe('StellarConfigService - contract ID allowlist by network', () => {
  function buildEnv(overrides: Record<string, string | undefined>) {
    return {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key in overrides) return overrides[key];
        return fallback;
      }),
    } as unknown as ConfigService;
  }

  function buildMetadataService(
    metadata: ReturnType<DeploymentMetadataService['getMetadata']>,
  ) {
    return {
      getMetadata: jest.fn(() => metadata),
      getAllContractIds: jest.fn(() => {
        if (!metadata) return {};
        const result: Record<string, string> = {};
        for (const [name, meta] of Object.entries(metadata.contracts)) {
          result[name] = meta.contract_id;
        }
        return result;
      }),
    } as unknown as DeploymentMetadataService;
  }

  const testnetMetadata = {
    contracts: {
      'confession-anchor': { contract_id: 'CANCHORTESTNET' } as any,
      'reputation-badges': { contract_id: 'CBADGETESTNET' } as any,
      'anonymous-tipping': { contract_id: 'CTIPTESTNET' } as any,
    },
    generated_at_utc: new Date().toISOString(),
    network: 'testnet',
    target: 'wasm32v1-none',
  };

  const mainnetMetadata = {
    ...testnetMetadata,
    contracts: {
      'confession-anchor': { contract_id: 'CANCHORMAINNET' } as any,
      'reputation-badges': { contract_id: 'CBADGEMAINNET' } as any,
      'anonymous-tipping': { contract_id: 'CTIPMAINNET' } as any,
    },
    network: 'mainnet',
  };

  it('boots successfully on testnet when contract IDs match testnet metadata', () => {
    const configService = buildEnv({
      STELLAR_NETWORK: 'testnet',
      STELLAR_FEATURES_ENABLED: 'true',
      CONFESSION_ANCHOR_CONTRACT_ID: 'CANCHORTESTNET',
      REPUTATION_BADGES_CONTRACT_ID: 'CBADGETESTNET',
      TIPPING_SYSTEM_CONTRACT_ID: 'CTIPTESTNET',
    });
    const metadataService = buildMetadataService(testnetMetadata);

    const service = new StellarConfigService(configService, metadataService);
    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.getConfig().contractIds.confessionAnchor).toBe('CANCHORTESTNET');
  });

  it('boots successfully on mainnet when contract IDs match mainnet metadata', () => {
    const configService = buildEnv({
      STELLAR_NETWORK: 'mainnet',
      STELLAR_FEATURES_ENABLED: 'true',
      CONFESSION_ANCHOR_CONTRACT_ID: 'CANCHORMAINNET',
      REPUTATION_BADGES_CONTRACT_ID: 'CBADGEMAINNET',
      TIPPING_SYSTEM_CONTRACT_ID: 'CTIPMAINNET',
    });
    const metadataService = buildMetadataService(mainnetMetadata);

    const service = new StellarConfigService(configService, metadataService);
    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.getConfig().contractIds.confessionAnchor).toBe('CANCHORMAINNET');
  });

  it('falls back to deployment metadata contract IDs when env vars are unset', () => {
    const configService = buildEnv({
      STELLAR_NETWORK: 'testnet',
      STELLAR_FEATURES_ENABLED: 'true',
    });
    const metadataService = buildMetadataService(testnetMetadata);

    const service = new StellarConfigService(configService, metadataService);
    expect(() => service.onModuleInit()).not.toThrow();
    expect(service.getConfig().contractIds).toEqual({
      confessionAnchor: 'CANCHORTESTNET',
      reputationBadges: 'CBADGETESTNET',
      tippingSystem: 'CTIPTESTNET',
    });
  });

  it('fails boot when testnet config loads mainnet deployment metadata', () => {
    const configService = buildEnv({
      STELLAR_NETWORK: 'testnet',
      STELLAR_FEATURES_ENABLED: 'true',
    });
    const metadataService = buildMetadataService(mainnetMetadata);

    const service = new StellarConfigService(configService, metadataService);
    expect(() => service.onModuleInit()).toThrow(/network mismatch/i);
  });

  it('fails boot when an explicit contract ID does not match the network deployment metadata', () => {
    const configService = buildEnv({
      STELLAR_NETWORK: 'testnet',
      STELLAR_FEATURES_ENABLED: 'true',
      // Accidentally pasted a mainnet contract ID into the testnet env.
      CONFESSION_ANCHOR_CONTRACT_ID: 'CANCHORMAINNET',
    });
    const metadataService = buildMetadataService(testnetMetadata);

    const service = new StellarConfigService(configService, metadataService);
    expect(() => service.onModuleInit()).toThrow(/contract ID mismatch/i);
  });

  it('fails boot when contract IDs are missing entirely and features are enabled', () => {
    const configService = buildEnv({
      STELLAR_NETWORK: 'testnet',
      STELLAR_FEATURES_ENABLED: 'true',
    });
    const metadataService = buildMetadataService(null);

    const service = new StellarConfigService(configService, metadataService);
    expect(() => service.onModuleInit()).toThrow(/missing contract IDs/i);
  });

  it('does not fail boot on mismatch when Stellar features are disabled', () => {
    const configService = buildEnv({
      STELLAR_NETWORK: 'testnet',
      STELLAR_FEATURES_ENABLED: 'false',
    });
    const metadataService = buildMetadataService(mainnetMetadata);

    const service = new StellarConfigService(configService, metadataService);
    expect(() => service.onModuleInit()).not.toThrow();
  });
});
