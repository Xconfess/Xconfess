import { Test, TestingModule } from '@nestjs/testing';
import { ConfessionController } from './confession.controller';
import { ConfessionService } from './confession.service';
import { ConfessionViewCacheService } from './confession-view-cache.service';
import { SearchDiscoveryService } from '../search-discovery/search-discovery.service';

describe('ConfessionController - View Count', () => {
  let controller: ConfessionController;
  let service: ConfessionService;
  let viewCache: ConfessionViewCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfessionController],
      providers: [
        {
          provide: ConfessionService,
          useValue: {
            getConfessionByIdWithViewCount: jest.fn(),
          },
        },
        {
          provide: ConfessionViewCacheService,
          useValue: {
            hasViewedRecently: jest.fn(),
            markViewed: jest.fn(),
          },
        },
        {
          provide: SearchDiscoveryService,
          useValue: { recordSearch: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<ConfessionController>(ConfessionController);
    service = module.get<ConfessionService>(ConfessionService);
    viewCache = module.get<ConfessionViewCacheService>(
      ConfessionViewCacheService,
    );
  });

  it('should increment view count for new viewer', async () => {
    const confession = { id: '1', view_count: 1 };
    const req = { user: { id: 'user1' }, ip: '127.0.0.1' };
    (service.getConfessionByIdWithViewCount as jest.Mock).mockResolvedValue(
      confession,
    );
    const result = await controller.getConfessionById('1', req as any);
    expect(result).not.toBeNull();
    expect(result!.view_count).toBe(1);
  });

  it('should handle anonymous users with IP-based tracking', async () => {
    const confession = { id: '1', view_count: 2 };
    (service.getConfessionByIdWithViewCount as jest.Mock).mockResolvedValue(
      confession,
    );
    const req = { ip: '192.168.1.1' }; // No user property
    const result = await controller.getConfessionById('1', req as any);
    expect(result).not.toBeNull();
    expect(result!.view_count).toBe(2);
    expect(service.getConfessionByIdWithViewCount).toHaveBeenCalledWith(
      '1',
      req,
    );
  });

  it('should handle service errors gracefully', async () => {
    (service.getConfessionByIdWithViewCount as jest.Mock).mockRejectedValue(
      new Error('Service error'),
    );
    const req = { user: { id: 'user1' }, ip: '127.0.0.1' };
    await expect(controller.getConfessionById('1', req as any)).rejects.toThrow(
      'Service error',
    );
  });
});
