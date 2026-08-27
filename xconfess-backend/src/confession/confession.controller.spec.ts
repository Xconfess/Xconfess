import { Test, TestingModule } from '@nestjs/testing';
import { ConfessionController } from './confession.controller';
import { ConfessionService } from './confession.service';
import { SearchDiscoveryService } from '../search-discovery/search-discovery.service';

describe('ConfessionController', () => {
  let controller: ConfessionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfessionController],
      providers: [
        { provide: ConfessionService, useValue: {} },
        { provide: SearchDiscoveryService, useValue: { recordSearch: jest.fn() } },
      ],
    }).compile();

    controller = module.get<ConfessionController>(ConfessionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
