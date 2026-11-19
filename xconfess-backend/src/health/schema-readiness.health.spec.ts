import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import {
  resolveMigrationDriftMode,
  SchemaReadinessHealthIndicator,
} from './schema-readiness.health';
import { MigrationVerificationService } from '../database/migration-verification.service';
import {
  computeMigrationDrift,
  MigrationDriftResult,
} from '../database/migration-drift';

const SCHEMA_OK = { ok: true, missingColumns: [], missingIndexes: [] };
const IN_SYNC = computeMigrationDrift(['A1', 'B2'], ['A1', 'B2']);

function causesOf(error: unknown): Record<string, any> {
  return (error as HealthCheckError).causes as Record<string, any>;
}

describe('SchemaReadinessHealthIndicator', () => {
  let indicator: SchemaReadinessHealthIndicator;
  let config: Record<string, unknown>;
  let migrationVerification: {
    checkConfessionSchema: jest.Mock;
    checkMigrationDrift: jest.Mock;
  };

  beforeEach(async () => {
    config = {};
    migrationVerification = {
      checkConfessionSchema: jest.fn().mockResolvedValue(SCHEMA_OK),
      checkMigrationDrift: jest.fn().mockResolvedValue(IN_SYNC),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchemaReadinessHealthIndicator,
        {
          provide: MigrationVerificationService,
          useValue: migrationVerification,
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();

    indicator = module.get(SchemaReadinessHealthIndicator);
  });

  async function failure(): Promise<Record<string, any>> {
    try {
      await indicator.isHealthy('schema');
    } catch (error) {
      expect(error).toBeInstanceOf(HealthCheckError);
      return causesOf(error).schema;
    }
    throw new Error('expected the schema check to fail');
  }

  it('returns up when schema and migrations are in sync', async () => {
    const result = await indicator.isHealthy('schema');

    expect(result.schema).toMatchObject({
      status: 'up',
      state: 'up',
      dependency: 'schema',
      critical: true,
      details: {
        table: 'anonymous_confessions',
        migrations: {
          mode: 'enforce',
          status: 'in_sync',
          shipped: 2,
          applied: 2,
          pendingCount: 0,
          unexpectedCount: 0,
        },
      },
    });
  });

  it('throws HealthCheckError when columns or indexes are missing', async () => {
    migrationVerification.checkConfessionSchema.mockResolvedValue({
      ok: false,
      missingColumns: ['search_vector'],
      missingIndexes: [],
    });

    const detail = await failure();
    expect(detail.errorCode).toBe('SCHEMA_DRIFT');
    expect(detail.details.missingColumns).toEqual(['search_vector']);
  });

  it('throws a redacted HealthCheckError when the verification query fails', async () => {
    migrationVerification.checkConfessionSchema.mockResolvedValue({
      ok: false,
      missingColumns: [],
      missingIndexes: [],
      queryError: 'connect ECONNREFUSED 10.0.0.12:5432 user=admin',
    });

    const detail = await failure();
    expect(detail.errorCode).toBe('QUERY_FAILED');
    expect(JSON.stringify(detail)).not.toContain('10.0.0.12');
    expect(JSON.stringify(detail)).not.toContain('admin');
  });

  describe('migration drift', () => {
    it('fails readiness when required migrations are pending', async () => {
      migrationVerification.checkMigrationDrift.mockResolvedValue(
        computeMigrationDrift(['A1', 'B2', 'C3'], ['A1']),
      );

      const detail = await failure();
      expect(detail).toMatchObject({
        status: 'down',
        state: 'down',
        errorCode: 'PENDING_MIGRATIONS',
        message: '2 required migration(s) pending',
        details: {
          migrations: { pendingCount: 2, pending: ['B2', 'C3'] },
        },
      });
      expect(detail.hint).toContain('migration:run');
    });

    it('fails readiness when the migrations table is missing', async () => {
      migrationVerification.checkMigrationDrift.mockResolvedValue(
        computeMigrationDrift(['A1'], [], { migrationsTableExists: false }),
      );

      const detail = await failure();
      expect(detail.errorCode).toBe('PENDING_MIGRATIONS');
      expect(detail.details.migrations.migrationsTableExists).toBe(false);
    });

    it('fails readiness when the migrations table cannot be read', async () => {
      const errored: MigrationDriftResult = {
        ...computeMigrationDrift([], []),
        ok: false,
        status: 'error',
        errorCode: 'QUERY_FAILED',
      };
      migrationVerification.checkMigrationDrift.mockResolvedValue(errored);

      const detail = await failure();
      expect(detail.errorCode).toBe('QUERY_FAILED');
    });

    it('reports unexpected migrations as degraded without failing readiness', async () => {
      migrationVerification.checkMigrationDrift.mockResolvedValue(
        computeMigrationDrift(['A1'], ['A1', 'Z9']),
      );

      const result = await indicator.isHealthy('schema');
      expect(result.schema).toMatchObject({
        status: 'up',
        state: 'degraded',
        errorCode: 'SCHEMA_DRIFT',
        details: { migrations: { unexpected: ['Z9'] } },
      });
    });

    it('fails on unexpected migrations when MIGRATION_DRIFT_FAIL_ON_UNEXPECTED=true', async () => {
      config.MIGRATION_DRIFT_FAIL_ON_UNEXPECTED = 'true';
      migrationVerification.checkMigrationDrift.mockResolvedValue(
        computeMigrationDrift(['A1'], ['A1', 'Z9']),
      );

      const detail = await failure();
      expect(detail.errorCode).toBe('SCHEMA_DRIFT');
    });

    it('only warns about pending migrations when MIGRATION_DRIFT_CHECK=warn', async () => {
      config.MIGRATION_DRIFT_CHECK = 'warn';
      migrationVerification.checkMigrationDrift.mockResolvedValue(
        computeMigrationDrift(['A1', 'B2'], ['A1']),
      );

      const result = await indicator.isHealthy('schema');
      expect(result.schema).toMatchObject({
        status: 'up',
        state: 'degraded',
        details: { migrations: { mode: 'warn', pending: ['B2'] } },
      });
    });

    it('skips the drift query when MIGRATION_DRIFT_CHECK=off', async () => {
      config.MIGRATION_DRIFT_CHECK = 'off';

      const result = await indicator.isHealthy('schema');
      expect(migrationVerification.checkMigrationDrift).not.toHaveBeenCalled();
      expect(result.schema.details.migrations).toEqual({ mode: 'off' });
    });

    it('caps listed migration names to keep responses bounded', async () => {
      const shipped = Array.from({ length: 30 }, (_, i) => `M${i}`);
      migrationVerification.checkMigrationDrift.mockResolvedValue(
        computeMigrationDrift(shipped, []),
      );

      const detail = await failure();
      expect(detail.details.migrations.pendingCount).toBe(30);
      expect(detail.details.migrations.pending).toHaveLength(20);
    });
  });

  describe('timeouts', () => {
    it('fails with TIMEOUT when schema queries hang past the bound', async () => {
      config.HEALTH_SCHEMA_TIMEOUT_MS = 100;
      migrationVerification.checkConfessionSchema.mockReturnValue(
        new Promise(() => undefined),
      );

      const startedAt = Date.now();
      const detail = await failure();
      expect(detail).toMatchObject({ errorCode: 'TIMEOUT', timeoutMs: 100 });
      expect(Date.now() - startedAt).toBeLessThan(2000);
    });

    it('recovers on the next check once the database answers again', async () => {
      config.HEALTH_SCHEMA_TIMEOUT_MS = 100;
      migrationVerification.checkConfessionSchema.mockReturnValueOnce(
        new Promise(() => undefined),
      );

      await failure();
      const result = await indicator.isHealthy('schema');
      expect(result.schema.state).toBe('up');
    });
  });
});

describe('resolveMigrationDriftMode', () => {
  it.each([
    [undefined, 'enforce'],
    ['', 'enforce'],
    ['ENFORCE', 'enforce'],
    ['warn', 'warn'],
    [' Off ', 'off'],
    ['garbage', 'enforce'],
  ])('maps %p to %p', (raw, expected) => {
    expect(resolveMigrationDriftMode(raw)).toBe(expected);
  });
});
