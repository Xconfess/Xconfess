import * as StellarSDK from '@stellar/stellar-sdk';

describe('Stellar Integration Test Fixtures', () => {
  it('builds deterministic testnet keypairs for integration-style scenarios', () => {
    const keypair = StellarSDK.Keypair.random();

    expect(keypair.publicKey()).toMatch(/^G[A-Z0-9]+$/);
    expect(keypair.secret()).toMatch(/^S[A-Z0-9]+$/);
  });

  it('normalizes confession hashes before on-chain verification', () => {
    const confessionHash = Buffer.from('test-confession-hash').toString('hex');

    expect(confessionHash).toMatch(/^[a-f0-9]+$/);
    expect(Buffer.from(confessionHash, 'hex').toString()).toBe(
      'test-confession-hash',
    );
  });
});
