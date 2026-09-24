import { Test, TestingModule } from '@nestjs/testing';
import { ConfessionController } from './confession.controller';
import { ConfessionService } from './confession.service';
import { SearchDiscoveryService } from '../search-discovery/search-discovery.service';
import { CursorPaginatedResponseDto } from '../common/pagination';
import { SortOrder } from './dto/get-confessions.dto';

describe('ConfessionController', () => {
  let controller: ConfessionController;
  const service = { getConfessions: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfessionController],
      providers: [
        { provide: ConfessionService, useValue: service },
        { provide: SearchDiscoveryService, useValue: { recordSearch: jest.fn() } },
      ],
    }).compile();

    controller = module.get<ConfessionController>(ConfessionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /confessions pagination metadata', () => {
    const pages = {
      first: new CursorPaginatedResponseDto([{ id: '1' }], 'c1', true, 1),
      middle: new CursorPaginatedResponseDto([{ id: '2' }], 'c2', true, 1),
      final: new CursorPaginatedResponseDto([{ id: '3' }], null, false, 1),
    };

    it.each(Object.entries(pages))(
      '%s page exposes nextCursor/hasNextPage and forwards query',
      async (_name, page) => {
        service.getConfessions.mockResolvedValue(page);
        const dto = {
          cursor: 'prev',
          limit: 1,
          gender: 'female',
          sort: SortOrder.TRENDING,
        } as any;

        const result = await controller.findAll(dto);

        expect(service.getConfessions).toHaveBeenCalledWith(dto);
        expect(result).toMatchObject({
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          hasNextPage: page.hasMore,
        });
      },
    );
  });
});
