import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisHealthIndicator } from './redis.health';
import { HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';

// Shared mocks for ioredis instance methods
const mockConnect = jest.fn();
const mockPing = jest.fn();
const mockDisconnect = jest.fn();

// Mock ioredis constructor
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      connect: mockConnect,
      ping: mockPing,
      disconnect: mockDisconnect,
    };
  });
});

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisHealthIndicator,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              if (key === 'REDIS_HOST') return 'localhost';
              if (key === 'REDIS_PORT') return 6379;
              return null;
            }),
          },
        },
      ],
    }).compile();

    indicator = module.get<RedisHealthIndicator>(RedisHealthIndicator);
    configService = module.get<ConfigService>(ConfigService);

    // Reset shared mocks
    mockConnect.mockReset();
    mockPing.mockReset();
    mockDisconnect.mockReset();
  });

  it('should return up if Redis ping is successful', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');

    const result = await indicator.isHealthy('redis');

    expect(result).toEqual({
      redis: {
        status: 'up',
        host: 'localhost',
        port: 6379,
      },
    });
    expect(mockConnect).toHaveBeenCalled();
    expect(mockPing).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should throw HealthCheckError if Redis ping fails', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockRejectedValue(new Error('Connection lost'));

    await expect(indicator.isHealthy('redis')).rejects.toThrow(
      HealthCheckError,
    );
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should throw HealthCheckError if Redis connection fails', async () => {
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(indicator.isHealthy('redis')).rejects.toThrow(
      HealthCheckError,
    );
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
