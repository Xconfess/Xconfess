import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckError } from '@nestjs/terminus';
import { getDataSourceToken } from '@nestjs/typeorm';
import { PostgresHealthIndicator } from './postgres.health';

function makeMockDataSource(
  overrides: {
    versionResult?: { version: string }[];
    connResult?: { active: string; max: string }[];
    queryError?: Error;
  } = {},
) {
  const versionResult = overrides.versionResult ?? [
    { version: 'PostgreSQL 16.3 on x86_64-pc-linux-gnu' },
  ];
  const connResult = overrides.connResult ?? [
    { active: '5', max: '100' },
  ];

  return {
    query: jest.fn().mockImplementation((sql: string) => {
      if (overrides.queryError) {
        return Promise.reject(overrides.queryError);
      }
      if (sql.includes('version()')) {
        return Promise.resolve(versionResult);
      }
      if (sql.includes('pg_stat_activity')) {
        return Promise.resolve(connResult);
      }
      return Promise.resolve([]);
    }),
  };
}

async function buildModule(dataSource: ReturnType<typeof makeMockDataSource>) {
  return Test.createTestingModule({
    providers: [
      PostgresHealthIndicator,
      {
        provide: getDataSourceToken(),
        useValue: dataSource,
      },
    ],
  }).compile();
}

describe('PostgresHealthIndicator', () => {
  let indicator: PostgresHealthIndicator;
  let dataSource: ReturnType<typeof makeMockDataSource>;

  describe('when postgres is healthy', () => {
    beforeEach(async () => {
      dataSource = makeMockDataSource();
      const module: TestingModule = await buildModule(dataSource);
      indicator = module.get(PostgresHealthIndicator);
    });

    it('returns up with version, latency, and connection counts', async () => {
      const result = await indicator.isHealthy('database');

      expect(result.database.status).toBe('up');
      expect(result.database.version).toBe('PostgreSQL 16.3');
      expect(result.database.activeConnections).toBe(5);
      expect(result.database.maxConnections).toBe(100);
      expect(typeof result.database.latencyMs).toBe('number');
    });

    it('calls the correct queries', async () => {
      await indicator.isHealthy('database');

      expect(dataSource.query).toHaveBeenCalledTimes(2);
      expect(dataSource.query).toHaveBeenCalledWith('SELECT version()');
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_stat_activity'),
      );
    });
  });

  describe('when postgres connection is refused', () => {
    beforeEach(async () => {
      dataSource = makeMockDataSource({
        queryError: new Error('connect ECONNREFUSED 127.0.0.1:5432'),
      });
      const module: TestingModule = await buildModule(dataSource);
      indicator = module.get(PostgresHealthIndicator);
    });

    it('throws HealthCheckError', async () => {
      await expect(indicator.isHealthy('database')).rejects.toThrow(
        HealthCheckError,
      );
    });

    it('includes actionable hint for ECONNREFUSED', async () => {
      expect.assertions(2);
      try {
        await indicator.isHealthy('database');
      } catch (err) {
        expect(err).toBeInstanceOf(HealthCheckError);
        const causes = (err as HealthCheckError).causes as Record<
          string,
          Record<string, unknown>
        >;
        expect(causes.database.hint).toContain(
          'not accepting connections',
        );
      }
    });
  });

  describe('when postgres times out', () => {
    beforeEach(async () => {
      dataSource = makeMockDataSource({
        queryError: new Error('Connection timed out'),
      });
      const module: TestingModule = await buildModule(dataSource);
      indicator = module.get(PostgresHealthIndicator);
    });

    it('includes actionable hint for timeout', async () => {
      expect.assertions(2);
      try {
        await indicator.isHealthy('database');
      } catch (err) {
        expect(err).toBeInstanceOf(HealthCheckError);
        const causes = (err as HealthCheckError).causes as Record<
          string,
          Record<string, unknown>
        >;
        expect(causes.database.hint).toContain('timed out');
      }
    });
  });

  describe('when postgres authentication fails', () => {
    beforeEach(async () => {
      dataSource = makeMockDataSource({
        queryError: new Error('password authentication failed for user "app"'),
      });
      const module: TestingModule = await buildModule(dataSource);
      indicator = module.get(PostgresHealthIndicator);
    });

    it('includes actionable hint for auth failure', async () => {
      expect.assertions(2);
      try {
        await indicator.isHealthy('database');
      } catch (err) {
        expect(err).toBeInstanceOf(HealthCheckError);
        const causes = (err as HealthCheckError).causes as Record<
          string,
          Record<string, unknown>
        >;
        expect(causes.database.hint).toContain('DATABASE_USER');
      }
    });
  });

  describe('when connection pool is exhausted', () => {
    beforeEach(async () => {
      dataSource = makeMockDataSource({
        queryError: new Error(
          'remaining connection slots are reserved for non-replication superuser connections',
        ),
      });
      const module: TestingModule = await buildModule(dataSource);
      indicator = module.get(PostgresHealthIndicator);
    });

    it('includes actionable hint for exhausted pool', async () => {
      expect.assertions(2);
      try {
        await indicator.isHealthy('database');
      } catch (err) {
        expect(err).toBeInstanceOf(HealthCheckError);
        const causes = (err as HealthCheckError).causes as Record<
          string,
          Record<string, unknown>
        >;
        expect(causes.database.hint).toContain('max_connections');
      }
    });
  });

  describe('error detail structure', () => {
    it('always includes status=down and error message in failure output', async () => {
      dataSource = makeMockDataSource({
        queryError: new Error('unknown db error'),
      });
      const module: TestingModule = await buildModule(dataSource);
      indicator = module.get(PostgresHealthIndicator);

      expect.assertions(3);
      try {
        await indicator.isHealthy('database');
      } catch (err) {
        const causes = (err as HealthCheckError).causes as Record<
          string,
          Record<string, unknown>
        >;
        expect(causes.database.status).toBe('down');
        expect(causes.database.error).toBe('unknown db error');
        expect(typeof causes.database.hint).toBe('string');
      }
    });
  });
});
