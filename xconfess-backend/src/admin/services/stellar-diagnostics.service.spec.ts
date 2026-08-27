import { Test, TestingModule } from '@nestjs/testing';
import { StellarDiagnosticsService } from './stellar-diagnostics.service';
import { StellarConfigService } from '../../stellar/stellar-config.service';
import { DeploymentMetadataService } from '../../stellar/services/deployment-metadata.service';

const mockConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-rpc-testnet.stellar.org',
  contractIds: {
    confessionAnchor: 'CABC123',
    reputationBadges: null,
    tippingSystem: undefined,
  },
};

const mockFreshness = {
  generatedAtUtc: '2026-05-21T12:34:56Z',
  isStale: false,
  daysSinceGeneration: 7,
};

function buildModule(fetchImpl: () => Promise<Response>) {
  const stellarConfigService = {
    getConfig: jest.fn().mockReturnValue(mockConfig),
  };

  const deploymentMetadataService = {
    getMetadata: jest.fn().mockReturnValue({ contracts: {} }),
    getMetadataFreshness: jest.fn().mockReturnValue(mockFreshness),
    getLoadError: jest.fn().mockReturnValue(null),
  };

  global.fetch = jest.fn().mockImplementation(fetchImpl) as unknown as typeof fetch;

  return Test.createTestingModule({
    providers: [
      StellarDiagnosticsService,
      { provide: StellarConfigService, useValue: stellarConfigService },
      { provide: DeploymentMetadataService, useValue: deploymentMetadataService },
    ],
  }).compile();
}

describe('StellarDiagnosticsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns horizonStatus ok when Horizon responds 200', async () => {
    const module: TestingModule = await buildModule(() =>
      Promise.resolve({ ok: true, status: 200 } as Response),
    );
    const service = module.get<StellarDiagnosticsService>(StellarDiagnosticsService);

    const result = await service.getDiagnostics();

    expect(result.horizonStatus).toBe('ok');
    expect(result.horizonLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.network).toBe('testnet');
    expect(result.contractIds.confessionAnchor).toBe('CABC123');
    expect(result.contractIds.reputationBadges).toBeNull();
    expect(result.contractIds.tippingSystem).toBeNull();
  });

  it('returns horizonStatus degraded when Horizon responds non-2xx', async () => {
    const module: TestingModule = await buildModule(() =>
      Promise.resolve({ ok: false, status: 503 } as Response),
    );
    const service = module.get<StellarDiagnosticsService>(StellarDiagnosticsService);

    const result = await service.getDiagnostics();

    expect(result.horizonStatus).toBe('degraded');
    expect(result.horizonLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns horizonStatus unreachable when fetch throws', async () => {
    const module: TestingModule = await buildModule(() =>
      Promise.reject(new Error('ECONNREFUSED')),
    );
    const service = module.get<StellarDiagnosticsService>(StellarDiagnosticsService);

    const result = await service.getDiagnostics();

    expect(result.horizonStatus).toBe('unreachable');
    // latencyMs is still measured even on failure
    expect(result.horizonLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns horizonStatus unreachable on AbortController timeout', async () => {
    const module: TestingModule = await buildModule(() => {
      const err = new DOMException('The user aborted a request.', 'AbortError');
      return Promise.reject(err);
    });
    const service = module.get<StellarDiagnosticsService>(StellarDiagnosticsService);

    const result = await service.getDiagnostics();

    expect(result.horizonStatus).toBe('unreachable');
  });

  it('never throws — degraded path is always safe', async () => {
    const module: TestingModule = await buildModule(() =>
      Promise.reject(new Error('network gone')),
    );
    const service = module.get<StellarDiagnosticsService>(StellarDiagnosticsService);

    await expect(service.getDiagnostics()).resolves.not.toThrow();
  });

  it('includes a checkedAt ISO timestamp', async () => {
    const module: TestingModule = await buildModule(() =>
      Promise.resolve({ ok: true } as Response),
    );
    const service = module.get<StellarDiagnosticsService>(StellarDiagnosticsService);

    const result = await service.getDiagnostics();

    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });
});