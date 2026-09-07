import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketHealthService } from './websocket-health.service';

describe('WebSocketHealthService', () => {
  it('does not fail websocket health on Redis when background jobs are disabled', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketHealthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              if (key === 'ENABLE_BACKGROUND_JOBS') return 'false';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    const service = module.get(WebSocketHealthService);
    const result = await service.checkHealth();

    expect(result.status).toBe('healthy');
    expect(result.dependencies?.redis).toMatchObject({
      status: 'disabled',
      details: { mode: 'disabled' },
    });
    expect(result.dependencies?.notifications).toMatchObject({
      status: 'up',
      details: { mode: 'disabled' },
    });
  });
});
