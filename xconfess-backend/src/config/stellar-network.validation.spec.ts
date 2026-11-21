import { envValidationSchema } from './env.validation';
import {
  findStellarNetworkConfigIssues,
  inferEndpointNetwork,
} from './stellar-network.validation';

const CONTRACT_IDS = {
  CONFESSION_ANCHOR_CONTRACT_ID: 'CB5XMDHT66EISB4WXM4YGNDHYRMZDX42TOHZEAENIUTSSMRFHJSFRNHB',
  REPUTATION_BADGES_CONTRACT_ID: 'CDAN4HZHY6XNQR3TRPLPJKVKNURVMMQMF7XNZ6AUNJNFLR77J4DNAEYI',
  TIPPING_SYSTEM_CONTRACT_ID: 'CC74UWNAAYDTPEPVKR4CPANWJSF6GI2PCI7BLN6M46KB6CSQYVYLHIWM',
};

const baseEnv = {
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_USERNAME: 'test',
  DB_PASSWORD: 'test',
  DB_NAME: 'test',
  JWT_SECRET: 'a'.repeat(32),
  CONFESSION_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ENCRYPTION_MASTER_KEY_v1:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  STELLAR_FEATURES_ENABLED: 'true',
};

const validate = (overrides: Record<string, unknown>) =>
  envValidationSchema.validate({ ...baseEnv, ...overrides });

describe('Stellar contract/network startup validation', () => {
  describe('consistent configuration', () => {
    it('passes for testnet with testnet endpoints and valid contract IDs', () => {
      const { error } = validate({
        ...CONTRACT_IDS,
        STELLAR_NETWORK: 'testnet',
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        STELLAR_SOROBAN_RPC_URL: 'https://soroban-rpc-testnet.stellar.org',
      });
      expect(error).toBeUndefined();
    });

    it('passes for mainnet with mainnet endpoints', () => {
      const { error } = validate({
        ...CONTRACT_IDS,
        STELLAR_NETWORK: 'mainnet',
        STELLAR_HORIZON_URL: 'https://horizon.stellar.org',
        STELLAR_SOROBAN_RPC_URL: 'https://soroban-rpc.stellar.org',
      });
      expect(error).toBeUndefined();
    });

    it('does not check endpoints it cannot classify (custom providers)', () => {
      const { error } = validate({
        ...CONTRACT_IDS,
        STELLAR_NETWORK: 'mainnet',
        STELLAR_HORIZON_URL: 'https://horizon.example-provider.io',
        STELLAR_SOROBAN_RPC_URL: 'http://localhost:8000/soroban/rpc',
      });
      expect(error).toBeUndefined();
    });

    it('skips all checks when Stellar features are disabled', () => {
      expect(
        findStellarNetworkConfigIssues({
          STELLAR_FEATURES_ENABLED: 'false',
          STELLAR_NETWORK: 'mainnet',
          STELLAR_SOROBAN_RPC_URL: 'https://soroban-rpc-testnet.stellar.org',
          CONFESSION_ANCHOR_CONTRACT_ID: 'bad',
        }),
      ).toEqual([]);
    });
  });

  describe('missing values', () => {
    it('reports every missing contract ID by name', () => {
      const { error } = validate({ STELLAR_NETWORK: 'testnet' });
      expect(error).toBeDefined();
      for (const name of Object.keys(CONTRACT_IDS)) {
        expect(error!.message).toContain(name);
      }
    });

    it('fails when mainnet relies on the default (testnet) endpoint URLs', () => {
      const { error } = validate({ ...CONTRACT_IDS, STELLAR_NETWORK: 'mainnet' });
      expect(error).toBeDefined();
      expect(error!.message).toContain(
        'STELLAR_HORIZON_URL points to a testnet endpoint (host "horizon-testnet.stellar.org") but STELLAR_NETWORK is "mainnet"',
      );
      expect(error!.message).toContain('STELLAR_SOROBAN_RPC_URL points to a testnet endpoint');
    });
  });

  describe('conflicting values', () => {
    it('rejects a mainnet RPC URL on testnet', () => {
      const { error } = validate({
        ...CONTRACT_IDS,
        STELLAR_NETWORK: 'testnet',
        STELLAR_SOROBAN_RPC_URL: 'https://soroban-rpc.stellar.org',
      });
      expect(error!.message).toContain(
        'STELLAR_SOROBAN_RPC_URL points to a mainnet endpoint (host "soroban-rpc.stellar.org") but STELLAR_NETWORK is "testnet". Set STELLAR_SOROBAN_RPC_URL to a testnet endpoint or change STELLAR_NETWORK.',
      );
    });

    it('rejects a futurenet endpoint for testnet', () => {
      const { error } = validate({
        ...CONTRACT_IDS,
        STELLAR_NETWORK: 'testnet',
        STELLAR_SOROBAN_RPC_URL: 'https://rpc-futurenet.stellar.org',
      });
      expect(error!.message).toContain('points to a futurenet endpoint');
    });

    it('rejects malformed contract IDs', () => {
      const { error } = validate({
        ...CONTRACT_IDS,
        TIPPING_SYSTEM_CONTRACT_ID: 'GBADPUBLICKEYINSTEADOFCONTRACT',
      });
      expect(error!.message).toContain(
        'TIPPING_SYSTEM_CONTRACT_ID is not a valid Soroban contract ID',
      );
    });

    it('rejects the same contract ID reused for different contracts', () => {
      const { error } = validate({
        ...CONTRACT_IDS,
        TIPPING_SYSTEM_CONTRACT_ID: CONTRACT_IDS.CONFESSION_ANCHOR_CONTRACT_ID,
      });
      expect(error!.message).toContain(
        'CONFESSION_ANCHOR_CONTRACT_ID and TIPPING_SYSTEM_CONTRACT_ID are set to the same contract ID',
      );
    });

    it('reports all conflicts together', () => {
      const issues = findStellarNetworkConfigIssues({
        STELLAR_FEATURES_ENABLED: 'true',
        STELLAR_NETWORK: 'mainnet',
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
        STELLAR_SOROBAN_RPC_URL: 'https://soroban-rpc-testnet.stellar.org',
        CONFESSION_ANCHOR_CONTRACT_ID: 'not-a-contract',
      });
      expect(issues).toHaveLength(3);
    });
  });

  describe('diagnostics do not expose secrets or private values', () => {
    it('never echoes contract ID values, URL credentials, paths or query strings', () => {
      const secretServer = `S${'Q'.repeat(55)}`;
      const { error } = validate({
        ...CONTRACT_IDS,
        CONFESSION_ANCHOR_CONTRACT_ID: 'CPRIVATEVALUE',
        STELLAR_NETWORK: 'mainnet',
        STELLAR_HORIZON_URL: 'https://horizon.stellar.org',
        STELLAR_SOROBAN_RPC_URL:
          'https://user:pa55word@soroban-testnet.provider.io/v1/api-key-123?token=abc',
        STELLAR_SERVER_SECRET: secretServer,
      });

      expect(error).toBeDefined();
      const message = error!.message;
      expect(message).toContain('host "soroban-testnet.provider.io"');
      for (const leaked of [
        'CPRIVATEVALUE',
        'pa55word',
        'api-key-123',
        'token=abc',
        secretServer,
      ]) {
        expect(message).not.toContain(leaked);
      }
    });
  });

  describe('inferEndpointNetwork', () => {
    it.each([
      ['https://horizon-testnet.stellar.org', 'testnet'],
      ['https://soroban-testnet.stellar.org', 'testnet'],
      ['https://horizon.stellar.org', 'mainnet'],
      ['https://mainnet.sorobanrpc.com', 'mainnet'],
      ['https://rpc-futurenet.stellar.org', 'futurenet'],
      ['https://rpc.example.com', null],
      ['not a url', null],
    ])('%s -> %s', (url, expected) => {
      expect(inferEndpointNetwork(url)).toBe(expected);
    });
  });
});
