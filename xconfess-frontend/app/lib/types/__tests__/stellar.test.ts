import type { StellarConfigResponse } from '../stellar';

describe('StellarConfigResponse', () => {
  it('accepts null contract IDs for unconfigured deployments', () => {
    const config: StellarConfigResponse = {
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: 'https://soroban-rpc-testnet.stellar.org',
      contractIds: {
        confessionAnchor: null,
        reputationBadges: null,
        tippingSystem: null,
      },
    };

    expect(config.contractIds.confessionAnchor).toBeNull();
    expect(config.contractIds.reputationBadges).toBeNull();
    expect(config.contractIds.tippingSystem).toBeNull();
  });

  it('accepts configured contract IDs', () => {
    const config: StellarConfigResponse = {
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: 'https://soroban-rpc-testnet.stellar.org',
      contractIds: {
        confessionAnchor: 'CANCHOR',
        reputationBadges: 'CBADGES',
        tippingSystem: 'CTIP',
      },
    };

    expect(config.contractIds.confessionAnchor).toBe('CANCHOR');
  });
});
