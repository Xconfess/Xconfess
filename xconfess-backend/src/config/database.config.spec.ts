import { ConfigService } from '@nestjs/config';
import { getTypeOrmConfig } from './database.config';

const createConfigService = (
  values: Record<string, string | number | undefined>,
): ConfigService =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

describe('getTypeOrmConfig', () => {
  it('allows explicitly enabled synchronization in local development', () => {
    const config = getTypeOrmConfig(
      createConfigService({
        NODE_ENV: 'development',
        TYPEORM_SYNCHRONIZE: 'true',
      }),
    );

    expect(config.synchronize).toBe(true);
  });

  it('rejects explicitly enabled synchronization in production', () => {
    expect(() =>
      getTypeOrmConfig(
        createConfigService({
          NODE_ENV: 'production',
          TYPEORM_SYNCHRONIZE: 'true',
        }),
      ),
    ).toThrow(
      'TYPEORM_SYNCHRONIZE=true is only permitted in local development. Disable it and run migrations instead.',
    );
  });

  it('runs migrations by default in production', () => {
    const config = getTypeOrmConfig(
      createConfigService({ NODE_ENV: 'production' }),
    );

    expect(config.migrationsRun).toBe(true);
  });
});
