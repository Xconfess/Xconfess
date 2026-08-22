import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisHealthIndicator } from './redis.health';
import { HealthCheckError } from '@nestjs/terminus';

// Shared mocks for ioredis instance methods
const mockConnect = jest.fn();
const mockPing = jest.fn();
const mockDisconnect = jest.fn();
const mockInfo = jest.fn();

// Mock ioredis constructor
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      connect: mockConnect,
      ping: mockPing,
      disconnect: mockDisconnect,
      info: mockInfo,
    };
  });
});

function configGetStub(overrides?: Record<string, unknown>) {
  return jest.fn().mockImplementation((key: string) => {
    if (overrides && key in overrides) return overrides[key];
    if (key === 'REDIS_HOST') return 'localhost';
    if (key === 'REDIS_PORT') return 6379;
    if (key === 'ENABLE_BACKGROUND_JOBS') return 'true';
    return null;
  });
}

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisHealthIndicator,
        {
          provide: ConfigService,
          useValue: { get: configGetStub() },
        },
      ],
    }).compile();

    indicator = module.get<RedisHealthIndicator>(RedisHealthIndicator);

    // Reset shared mocks
    mockConnect.mockReset();
    mockPing.mockReset();
    mockDisconnect.mockReset();
    mockInfo.mockReset();
  });

  it('should return up with latency, version, and connectedClients on success', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');
    mockInfo.mockImplementation((section: string) => {
      if (section === 'server') return Promise.resolve('redis_version:7.2.0\r\n');
      if (section === 'clients') return Promise.resolve('connected_clients:5\r\n');
      return Promise.resolve('');
    });

    const result = await indicator.isHealthy('redis');

    expect(result).toEqual({
      redis: {
        status: 'up',
        host: 'localhost',
        port: 6379,
        latencyMs: expect.any(Number),
        version: '7.2.0',
        connectedClients: 5,
      },
    });
    expect(mockConnect).toHaveBeenCalled();
    expect(mockPing).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should throw HealthCheckError with hint if Redis ping fails', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockRejectedValue(new Error('Connection lost'));

    await expect(indicator.isHealthy('redis')).rejects.toThrow(
      HealthCheckError,
    );
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should throw HealthCheckError with ECONNREFUSED hint', async () => {
    mockConnect.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));

    expect.assertions(2);
    try {
      await indicator.isHealthy('redis');
    } catch (err) {
      expect(err).toBeInstanceOf(HealthCheckError);
      const causes = (err as HealthCheckError).causes as Record<
        string,
        Record<string, unknown>
      >;
      expect(causes.redis.hint).toContain('not running');
    }
  });

  it('should throw HealthCheckError with timeout hint', async () => {
    mockConnect.mockRejectedValue(new Error('Connection timed out'));

    expect.assertions(2);
    try {
      await indicator.isHealthy('redis');
    } catch (err) {
      expect(err).toBeInstanceOf(HealthCheckError);
      const causes = (err as HealthCheckError).causes as Record<
        string,
        Record<string, unknown>
      >;
      expect(causes.redis.hint).toContain('timed out');
    }
  });

  it('should throw HealthCheckError with auth hint on NOAUTH', async () => {
    mockConnect.mockRejectedValue(new Error('NOAUTH Authentication required'));

    expect.assertions(2);
    try {
      await indicator.isHealthy('redis');
    } catch (err) {
      expect(err).toBeInstanceOf(HealthCheckError);
      const causes = (err as HealthCheckError).causes as Record<
        string,
        Record<string, unknown>
      >;
      expect(causes.redis.hint).toContain('REDIS_PASSWORD');
    }
  });

  it('should return disabled mode when ENABLE_BACKGROUND_JOBS is not true', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisHealthIndicator,
        {
          provide: ConfigService,
          useValue: {
            get: configGetStub({ ENABLE_BACKGROUND_JOBS: 'false' }),
          },
        },
      ],
    }).compile();

    const ind = module.get<RedisHealthIndicator>(RedisHealthIndicator);
    const result = await ind.isHealthy('redis');

    expect(result).toEqual({
      redis: {
        status: 'up',
        mode: 'disabled',
        reason: expect.stringContaining('intentionally disabled'),
        severity: 'info',
      },
    });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('includes generic hint for unknown errors', async () => {
    mockConnect.mockRejectedValue(new Error('some weird error'));

    expect.assertions(2);
    try {
      await indicator.isHealthy('redis');
    } catch (err) {
      expect(err).toBeInstanceOf(HealthCheckError);
      const causes = (err as HealthCheckError).causes as Record<
        string,
        Record<string, unknown>
      >;
      expect(causes.redis.hint).toContain('REDIS_HOST');
    }
  });
});
