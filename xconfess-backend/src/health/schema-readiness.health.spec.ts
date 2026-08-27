import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckError } from '@nestjs/terminus';
import { SchemaReadinessHealthIndicator } from './schema-readiness.health';
import { MigrationVerificationService } from '../database/migration-verification.service';

describe('SchemaReadinessHealthIndicator', () => {
  let indicator: SchemaReadinessHealthIndicator;
  let migrationVerification: jest.Mocked<
    Pick<MigrationVerificationService, 'checkConfessionSchema'>
  >;

  beforeEach(async () => {
    migrationVerification = {
      checkConfessionSchema: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchemaReadinessHealthIndicator,
        {
          provide: MigrationVerificationService,
          useValue: migrationVerification,
        },
      ],
    }).compile();

    indicator = module.get(SchemaReadinessHealthIndicator);
  });

  it('returns up when schema check passes', async () => {
    migrationVerification.checkConfessionSchema.mockResolvedValue({
      ok: true,
      missingColumns: [],
      missingIndexes: [],
    });

    const result = await indicator.isHealthy('schema');

    expect(result).toMatchObject({
      schema: {
        status: 'up',
        table: 'anonymous_confessions',
      },
    });
  });

  it('throws HealthCheckError when columns or indexes are missing', async () => {
    migrationVerification.checkConfessionSchema.mockResolvedValue({
      ok: false,
      missingColumns: ['search_vector'],
      missingIndexes: [],
    });

    await expect(indicator.isHealthy('schema')).rejects.toThrow(
      HealthCheckError,
    );
  });

  it('throws HealthCheckError when verification query fails', async () => {
    migrationVerification.checkConfessionSchema.mockResolvedValue({
      ok: false,
      missingColumns: [],
      missingIndexes: [],
      queryError: 'timeout',
    });

    await expect(indicator.isHealthy('schema')).rejects.toThrow(
      HealthCheckError,
    );
  });
});
