import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
          useValue: { query, entityMetadatas: [] },
        },
      ],
    }).compile();

    service = module.get(MigrationVerificationService);
  });

  // ── checkConfessionSchema ───────────────────────────────────────────────────

  describe('checkConfessionSchema', () => {
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

    it('returns degraded when search_vector column is missing', async () => {
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

    it('returns degraded when view_count column is missing', async () => {
      query
        .mockResolvedValueOnce([{ column_name: 'search_vector' }])
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_INDEXES.map((indexname) => ({ indexname })),
        );

      const result = await service.checkConfessionSchema();

      expect(result.ok).toBe(false);
      expect(result.missingColumns).toEqual(['view_count']);
      expect(result.missingIndexes).toEqual([]);
    });

    it('returns degraded when both columns are missing', async () => {
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_INDEXES.map((indexname) => ({ indexname })),
        );

      const result = await service.checkConfessionSchema();

      expect(result.ok).toBe(false);
      expect(result.missingColumns).toEqual(['search_vector', 'view_count']);
      expect(result.missingIndexes).toEqual([]);
    });

    it('returns degraded when idx_confession_created_at is missing', async () => {
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

    it('returns degraded when idx_confession_search_vector is missing', async () => {
      query
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_COLUMNS.map((column_name) => ({ column_name })),
        )
        .mockResolvedValueOnce([{ indexname: 'idx_confession_created_at' }]);

      const result = await service.checkConfessionSchema();

      expect(result.ok).toBe(false);
      expect(result.missingColumns).toEqual([]);
      expect(result.missingIndexes).toEqual(['idx_confession_search_vector']);
    });

    it('returns degraded when both indexes are missing', async () => {
      query
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_COLUMNS.map((column_name) => ({ column_name })),
        )
        .mockResolvedValueOnce([]);

      const result = await service.checkConfessionSchema();

      expect(result.ok).toBe(false);
      expect(result.missingColumns).toEqual([]);
      expect(result.missingIndexes).toEqual([
        'idx_confession_search_vector',
        'idx_confession_created_at',
      ]);
    });

    it('returns degraded when both columns and both indexes are missing', async () => {
      query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.checkConfessionSchema();

      expect(result.ok).toBe(false);
      expect(result.missingColumns).toEqual(['search_vector', 'view_count']);
      expect(result.missingIndexes).toEqual([
        'idx_confession_search_vector',
        'idx_confession_created_at',
      ]);
    });

    it('returns queryError when the first SQL call fails', async () => {
      query.mockRejectedValueOnce(new Error('connection refused'));

      const result = await service.checkConfessionSchema();

      expect(result.ok).toBe(false);
      expect(result.queryError).toBe('connection refused');
      expect(result.missingColumns).toEqual([]);
      expect(result.missingIndexes).toEqual([]);
    });

    it('returns queryError when the second SQL call fails', async () => {
      query
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_COLUMNS.map((column_name) => ({ column_name })),
        )
        .mockRejectedValueOnce(new Error('pg_indexes permission denied'));

      const result = await service.checkConfessionSchema();

      expect(result.ok).toBe(false);
      expect(result.queryError).toBe('pg_indexes permission denied');
    });

    it('stringifies non-Error rejections into queryError', async () => {
      query.mockRejectedValueOnce('raw string error');

      const result = await service.checkConfessionSchema();

      expect(result.ok).toBe(false);
      expect(result.queryError).toBe('raw string error');
    });

    it('makes exactly 2 SQL calls for a successful check', async () => {
      query
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_COLUMNS.map((column_name) => ({ column_name })),
        )
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_INDEXES.map((indexname) => ({ indexname })),
        );

      await service.checkConfessionSchema();

      expect(query).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkForeignKeyIntegrity', () => {
    const relation = {
      isOwning: true,
      joinColumns: [
        {
          databaseName: 'anonymous_user_id',
          referencedColumn: { databaseName: 'id' },
        },
      ],
      inverseEntityMetadata: { tableName: 'anonymous_users' },
      onDelete: 'CASCADE',
      onUpdate: undefined,
    };

    beforeEach(() => {
      (service as any).dataSource.entityMetadatas = [
        { tableName: 'anonymous_confessions', relations: [relation] },
      ];
    });

    it('validates foreign-key columns, actions, and a leading-column index', async () => {
      query
        .mockResolvedValueOnce([
          {
            table_name: 'anonymous_confessions',
            referenced_table: 'anonymous_users',
            columns: ['anonymous_user_id'],
            referenced_columns: ['id'],
            delete_action: 'c',
            update_action: 'a',
          },
        ])
        .mockResolvedValueOnce([
          {
            table_name: 'anonymous_confessions',
            columns: ['anonymous_user_id', 'created_at'],
          },
        ]);

      await expect(service.checkForeignKeyIntegrity()).resolves.toEqual({
        ok: true,
        missingForeignKeys: [],
        missingIndexes: [],
      });
    });

    it('reports missing or incorrectly configured foreign keys and indexes', async () => {
      query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.checkForeignKeyIntegrity();

      expect(result.ok).toBe(false);
      expect(result.missingForeignKeys).toEqual([
        'anonymous_confessions(anonymous_user_id) -> anonymous_users(id)',
      ]);
      expect(result.missingIndexes).toEqual([
        'anonymous_confessions(anonymous_user_id)',
      ]);
    });

    it('returns query errors without throwing', async () => {
      query.mockRejectedValueOnce(new Error('catalog unavailable'));

      await expect(service.checkForeignKeyIntegrity()).resolves.toMatchObject({
        ok: false,
        queryError: 'catalog unavailable',
      });
    });
  });

  // ── onModuleInit (startup logging) ─────────────────────────────────────────

  describe('onModuleInit', () => {
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('skips schema check in test environment', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      await service.onModuleInit();

      expect(query).not.toHaveBeenCalled();
      process.env.NODE_ENV = origEnv;
    });

    it('logs ok when schema is healthy', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      query
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_COLUMNS.map((column_name) => ({ column_name })),
        )
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_INDEXES.map((indexname) => ({ indexname })),
        );

      await service.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('schema_readiness_ok'),
      );
      process.env.NODE_ENV = origEnv;
    });

    it('logs warn when schema is degraded', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('schema_readiness_degraded'),
      );
      process.env.NODE_ENV = origEnv;
    });

    it('logs error when query fails', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      query.mockRejectedValueOnce(new Error('timeout'));

      await service.onModuleInit();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('schema_readiness'),
      );
      process.env.NODE_ENV = origEnv;
    });

    it('warn log includes correct repair command hint', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      query
        .mockResolvedValueOnce([]) // all columns missing
        .mockResolvedValueOnce(
          REQUIRED_CONFESSION_INDEXES.map((indexname) => ({ indexname })),
        );

      await service.onModuleInit();

      const warnMessage: string = warnSpy.mock.calls[0][0];
      expect(warnMessage).toContain('backend:migration:run');
      process.env.NODE_ENV = origEnv;
    });
  });

  // ── verifyMigrations ──────────────────────────────────────────────────

  describe('verifyMigrations', () => {
    it('reports duplicate migration timestamps across migration directories', async () => {
      const issues = await service.verifyMigrations();
      expect(issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Duplicate migration timestamp:'),
        ]),
      );
      expect(
        issues.some((issue) =>
          issue.startsWith('Migration has no rollback method:'),
        ),
      ).toBe(false);
    });
  });

  // ── checkEntityColumnCompatibility ──────────────────────────────────────────

  describe('checkEntityColumnCompatibility', () => {
    type ColumnSpec = [databaseName: string, isNullable: boolean];

    function entity(tableName: string, columns: ColumnSpec[]) {
      return {
        tableName,
        columns: columns.map(([databaseName, isNullable]) => ({
          databaseName,
          isNullable,
        })),
      };
    }

    function catalogRow(
      table_name: string,
      column_name: string,
      nullable: boolean,
    ) {
      return { table_name, column_name, is_nullable: nullable ? 'YES' : 'NO' };
    }

    function serviceWith(entities: unknown[], rows: unknown, error?: Error) {
      const queryFn = error
        ? jest.fn().mockRejectedValue(error)
        : jest.fn().mockResolvedValue(rows);
      return new MigrationVerificationService({
        query: queryFn,
        entityMetadatas: entities,
      } as unknown as DataSource);
    }

    it('returns ok when every entity column exists with a matching nullability', async () => {
      const svc = serviceWith(
        [entity('users', [['id', false], ['nickname', true]])],
        [
          catalogRow('users', 'id', false),
          catalogRow('users', 'nickname', true),
        ],
      );

      await expect(svc.checkEntityColumnCompatibility()).resolves.toEqual({
        ok: true,
        missingTables: [],
        missingColumns: [],
        nullabilityMismatches: [],
      });
    });

    it('reports an entity whose table does not exist', async () => {
      const svc = serviceWith(
        [entity('reports', [['id', false]])],
        [catalogRow('users', 'id', false)],
      );

      const result = await svc.checkEntityColumnCompatibility();
      expect(result.ok).toBe(false);
      expect(result.missingTables).toEqual(['reports']);
      expect(result.missingColumns).toEqual([]);
    });

    it('reports a column declared on the entity but absent from the table', async () => {
      const svc = serviceWith(
        [entity('users', [['id', false], ['deleted_at', true]])],
        [catalogRow('users', 'id', false)],
      );

      const result = await svc.checkEntityColumnCompatibility();
      expect(result.ok).toBe(false);
      expect(result.missingColumns).toEqual(['users.deleted_at']);
    });

    it('reports NULL / NOT NULL drift in both directions with both sides named', async () => {
      const svc = serviceWith(
        [entity('users', [['email', false], ['bio', true]])],
        [catalogRow('users', 'email', true), catalogRow('users', 'bio', false)],
      );

      const result = await svc.checkEntityColumnCompatibility();
      expect(result.ok).toBe(false);
      expect(result.nullabilityMismatches).toEqual([
        'users.email (entity NOT NULL, database NULL)',
        'users.bio (entity NULL, database NOT NULL)',
      ]);
    });

    it('lists a missing table once even when several entities map to it', async () => {
      const svc = serviceWith(
        [
          entity('reports', [['id', false]]),
          entity('reports', [['id', false], ['reason', true]]),
        ],
        [],
      );

      const result = await svc.checkEntityColumnCompatibility();
      expect(result.missingTables).toEqual(['reports']);
    });

    it('matches tables and columns case-sensitively, as PostgreSQL stores them', async () => {
      const svc = serviceWith(
        [entity('users', [['createdAt', false]])],
        [catalogRow('users', 'created_at', false)],
      );

      const result = await svc.checkEntityColumnCompatibility();
      expect(result.missingColumns).toEqual(['users.createdAt']);
    });

    it('returns queryError instead of throwing when the catalog query fails', async () => {
      const svc = serviceWith(
        [entity('users', [['id', false]])],
        undefined,
        new Error('connection refused'),
      );

      await expect(svc.checkEntityColumnCompatibility()).resolves.toEqual({
        ok: false,
        missingTables: [],
        missingColumns: [],
        nullabilityMismatches: [],
        queryError: 'connection refused',
      });
    });
  });

  // ── REQUIRED_CONFESSION_COLUMNS / REQUIRED_CONFESSION_INDEXES constants ─────

  describe('exported constants', () => {
    it('REQUIRED_CONFESSION_COLUMNS contains search_vector', () => {
      expect(REQUIRED_CONFESSION_COLUMNS).toContain('search_vector');
    });

    it('REQUIRED_CONFESSION_COLUMNS contains view_count', () => {
      expect(REQUIRED_CONFESSION_COLUMNS).toContain('view_count');
    });

    it('REQUIRED_CONFESSION_INDEXES contains idx_confession_search_vector', () => {
      expect(REQUIRED_CONFESSION_INDEXES).toContain(
        'idx_confession_search_vector',
      );
    });

    it('REQUIRED_CONFESSION_INDEXES contains idx_confession_created_at', () => {
      expect(REQUIRED_CONFESSION_INDEXES).toContain(
        'idx_confession_created_at',
      );
    });
  });
});
