import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarService } from '../stellar.service';
import { StellarConfigService } from '../stellar-config.service';
import { TransactionBuilderService } from '../transaction-builder.service';
import { DeploymentMetadataService } from '../services/deployment-metadata.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnonymousConfession } from '../../confession/entities/confession.entity';

describe('StellarService', () => {
  let service: StellarService;
  const loadAccount = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: StellarConfigService,
          useValue: {
            getConfig: jest.fn(() => ({
              network: 'testnet',
              horizonUrl: 'https://horizon-testnet.stellar.org',
              sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
              rpcMaxRetries: 0,
              rpcRetryBaseDelayMs: 1,
              rpcRetryMaxDelayMs: 1,
              rpcTimeoutMs: 100,
              contractIds: {},
            })),
            getServer: jest.fn(() => ({ loadAccount })),
          },
        },
        TransactionBuilderService,
        DeploymentMetadataService,
        {
          provide: getRepositoryToken(AnonymousConfession),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                STELLAR_NETWORK: 'testnet',
                STELLAR_SERVER_SECRET:
                  'SCXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
    loadAccount.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getNetworkConfig', () => {
    it('should return network configuration', () => {
      const config = service.getNetworkConfig();
      expect(config).toHaveProperty('network');
      expect(config).toHaveProperty('horizonUrl');
      expect(config).toHaveProperty('sorobanRpcUrl');
      expect(config).toHaveProperty('contractIds');
      expect(config.contractIds).toEqual({
        confessionAnchor: null,
        reputationBadges: null,
        tippingSystem: null,
      });
      expect(config).toHaveProperty('deploymentMetadata');
      expect(config.deploymentMetadata.loaded).toBe(false);
      expect(config).not.toHaveProperty('serverSecret');
    });

    it('should return testnet configuration in test environment', () => {
      const config = service.getNetworkConfig();
      expect(config.network).toBe('testnet');
      expect(config.horizonUrl).toContain('testnet');
    });
  });

  describe('accountExists', () => {
    it('should return true for existing account', async () => {
      const testAccount =
        'GBVXZHTLP3PFTIQYKQJQAZCQVKTQSQFM23R2PI7F3VGHKJJUXQWVYUHH';
      loadAccount.mockResolvedValue({ id: testAccount });
      const exists = await service.accountExists(testAccount);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent account', async () => {
      const fakeAccount =
        'GBVXZHTLP3PFTIQYKQJQAZCQVKTQSQFM23R2PI7F3VGHKJJUXQWVYXXX';
      loadAccount.mockRejectedValue(new Error('not found'));
      const exists = await service.accountExists(fakeAccount);
      expect(exists).toBe(false);
    });
  });
});
