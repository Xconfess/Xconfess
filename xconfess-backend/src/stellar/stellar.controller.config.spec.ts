import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { ContractService } from './contract.service';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../audit-log/audit-log.service';
import { StellarConfigResponseDto } from './dto/stellar-config-response.dto';
import { StellarInvokeContractGuard } from './guards/stellar-invoke-contract.guard';
import { StellarConfigService } from './stellar-config.service';

describe('StellarController GET /stellar/config and anchor verification', () => {
  let app: INestApplication;

  const mockConfig: StellarConfigResponseDto = {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-rpc-testnet.stellar.org',
    contractIds: {
      confessionAnchor: 'CANCHOR123',
      reputationBadges: null,
      tippingSystem: 'CTIP456',
    },
    deploymentMetadata: {
      loaded: true,
      generatedAtUtc: '2026-01-01T00:00:00Z',
      isStale: false,
      ageDays: 1,
      loadError: null,
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [StellarController],
      providers: [
        {
          provide: StellarService,
          useValue: { getNetworkConfig: jest.fn().mockReturnValue(mockConfig) },
        },
        {
          provide: ContractService,
          useValue: {
            verifyConfession: jest.fn().mockResolvedValue(1684939200),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        {
          provide: StellarConfigService,
          useValue: { getContractId: jest.fn() },
        },
        {
          provide: StellarInvokeContractGuard,
          useValue: { canActivate: jest.fn(() => true) },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns network, endpoints, and contract IDs without secrets', async () => {
    const res = await request(app.getHttpServer()).get('/stellar/config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockConfig);
    expect(res.body).not.toHaveProperty('serverSecret');
    expect(res.body).not.toHaveProperty('STELLAR_SERVER_SECRET');
    expect(res.body.contractIds.reputationBadges).toBeNull();
    expect(res.body.contractIds.confessionAnchor).toBe('CANCHOR123');
    expect(res.body.deploymentMetadata.loaded).toBe(true);
  });

  it('verifies a confession hash via the anchor contract', async () => {
    const hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const res = await request(app.getHttpServer()).get(`/stellar/anchor/verify/${hash}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isAnchored: true, timestamp: 1684939200 });
  });
});
