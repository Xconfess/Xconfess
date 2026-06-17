import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';
import { RedisHealthIndicator } from './redis.health';

const mockConnect = jest.fn();
const mockPing = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    ping: mockPing,
    disconnect: mockDisconnect,
  }));
});

const MockRedis = Redis as unknown as jest.Mock;

async function buildIndicator(config: Record<string, unknown>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RedisHealthIndicator,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string, defaultValue?: unknown) =>
            Object.prototype.hasOwnProperty.call(config, key)
              ? config[key]
              : defaultValue,
          ),
        },
      },
    ],
  }).compile();

  return module.get<RedisHealthIndicator>(RedisHealthIndicator);
}

describe('RedisHealthIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockReset();
    mockPing.mockReset();
    mockDisconnect.mockReset();
    MockRedis.mockClear();
  });

  it('returns up and skips Redis when background jobs are disabled', async () => {
    const indicator = await buildIndicator({
      ENABLE_BACKGROUND_JOBS: 'false',
    });

    const result = await indicator.isHealthy('redis');

    expect(result.redis).toMatchObject({
      status: 'up',
      mode: 'disabled',
      severity: 'info',
    });
    expect(result.redis.reason).toContain('"false"');
    expect(MockRedis).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('returns up if Redis ping is successful when jobs are enabled', async () => {
    const indicator = await buildIndicator({
      ENABLE_BACKGROUND_JOBS: 'true',
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
    });
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');

    const result = await indicator.isHealthy('redis');

    expect(result).toEqual({
      redis: {
        status: 'up',
        host: 'redis.internal',
        port: 6380,
      },
    });
    expect(MockRedis).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'redis.internal',
        port: 6380,
        lazyConnect: true,
      }),
    );
    expect(mockConnect).toHaveBeenCalled();
    expect(mockPing).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('throws HealthCheckError if Redis ping fails when jobs are enabled', async () => {
    const indicator = await buildIndicator({
      ENABLE_BACKGROUND_JOBS: 'true',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
    });
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockRejectedValue(new Error('Connection lost'));

    await expect(indicator.isHealthy('redis')).rejects.toThrow(
      HealthCheckError,
    );
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('throws HealthCheckError if Redis connection fails when jobs are enabled', async () => {
    const indicator = await buildIndicator({
      ENABLE_BACKGROUND_JOBS: 'true',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
    });
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(indicator.isHealthy('redis')).rejects.toThrow(
      HealthCheckError,
    );
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('throws HealthCheckError for unexpected Redis ping responses', async () => {
    const indicator = await buildIndicator({
      ENABLE_BACKGROUND_JOBS: 'true',
    });
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('NOPE');

    await expect(indicator.isHealthy('redis')).rejects.toThrow(
      HealthCheckError,
    );
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
