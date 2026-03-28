import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  MigrationVerificationService,
  REQUIRED_CONFESSION_COLUMNS,
  REQUIRED_CONFESSION_INDEXES,
} from './migration-verification.service';

describe('MigrationVerificationService', () => {
  let service: MigrationVerificationService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrationVerificationService,
        {
          provide: getDataSourceToken(),
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(MigrationVerificationService);
  });

  it('returns ok when all required columns and indexes exist', async () => {
    query
      .mockResolvedValueOnce(
        REQUIRED_CONFESSION_COLUMNS.map((column_name) => ({ column_name })),
      )
      .mockResolvedValueOnce(
        REQUIRED_CONFESSION_INDEXES.map((indexname) => ({ indexname })),
      );

    const result = await service.checkConfessionSchema();

    expect(result.ok).toBe(true);
    expect(result.missingColumns).toEqual([]);
    expect(result.missingIndexes).toEqual([]);
    expect(result.queryError).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('returns degraded when columns are missing', async () => {
    query
      .mockResolvedValueOnce([{ column_name: 'view_count' }])
      .mockResolvedValueOnce(
        REQUIRED_CONFESSION_INDEXES.map((indexname) => ({ indexname })),
      );

    const result = await service.checkConfessionSchema();

    expect(result.ok).toBe(false);
    expect(result.missingColumns).toEqual(['search_vector']);
    expect(result.missingIndexes).toEqual([]);
  });

  it('returns degraded when indexes are missing', async () => {
    query
      .mockResolvedValueOnce(
        REQUIRED_CONFESSION_COLUMNS.map((column_name) => ({ column_name })),
      )
      .mockResolvedValueOnce([{ indexname: 'idx_confession_search_vector' }]);

    const result = await service.checkConfessionSchema();

    expect(result.ok).toBe(false);
    expect(result.missingColumns).toEqual([]);
    expect(result.missingIndexes).toEqual(['idx_confession_created_at']);
  });

  it('returns queryError when SQL fails', async () => {
    query.mockRejectedValueOnce(new Error('connection refused'));

    const result = await service.checkConfessionSchema();

    expect(result.ok).toBe(false);
    expect(result.queryError).toBe('connection refused');
    expect(result.missingColumns).toEqual([]);
    expect(result.missingIndexes).toEqual([]);
  });
});
