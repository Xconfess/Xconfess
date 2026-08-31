// src/config/typeorm.config.ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const nodeEnv = (configService.get<string>('NODE_ENV') || '').toLowerCase();
  const appEnv = (configService.get<string>('APP_ENV') || '').toLowerCase();
  const syncOptIn = (
    configService.get<string>('TYPEORM_SYNCHRONIZE') || ''
  ).toLowerCase();
  const productionSyncOptIn = (
    configService.get<string>('TYPEORM_ALLOW_PRODUCTION_SYNCHRONIZE') || ''
  ).toLowerCase();
  const migrationsRunSetting = configService.get<string>(
    'TYPEORM_MIGRATIONS_RUN',
  );
  const loggingSetting = (
    configService.get<string>('TYPEORM_LOGGING') || ''
  ).toLowerCase();
  const isCompiledRuntime = __dirname.includes(`${path.sep}dist${path.sep}`);
  const migrationExtension = isCompiledRuntime ? 'js' : 'ts';

  const isLocalDevEnv =
    nodeEnv === 'development' ||
    nodeEnv === 'dev' ||
    nodeEnv === 'local' ||
    appEnv === 'development' ||
    appEnv === 'dev' ||
    appEnv === 'local';

  if (!isLocalDevEnv && TRUE_VALUES.has(syncOptIn)) {
    throw new Error(
      'TYPEORM_SYNCHRONIZE must be false outside local development. Use migrations for production and staging deploys.',
    );
  }

  // Conservative default: never sync unless explicitly opted-in in local/dev only.
  const synchronize = TRUE_VALUES.has(syncOptIn) && isLocalDevEnv;
  const migrationsRun =
    migrationsRunSetting === undefined
      ? !['test', 'ci'].includes(nodeEnv) && !isLocalDevEnv
      : TRUE_VALUES.has(migrationsRunSetting.toLowerCase());

  const dbHost = configService.get<string>('DB_HOST');
  const dbPort = configService.get<number>('DB_PORT');
  const dbUsername = configService.get<string>('DB_USERNAME');
  const dbPassword = configService.get<string>('DB_PASSWORD');
  const dbName = configService.get<string>('DB_NAME');

  const readHost = configService.get<string>('DB_READ_HOST') || dbHost;
  const readPort = configService.get<number>('DB_READ_PORT') || dbPort;

  return {
    type: 'postgres',
    /*
     * Replication topology:
     *
     *   master  – used for all writes (INSERT, UPDATE, DELETE, DDL).
     *   slaves  – used for reads  (SELECT, find(), createQueryBuilder reads).
     *
     * In local / single-node dev the replica can point to the same host.
     * In production, set DB_READ_HOST / DB_READ_PORT to point to one or
     * more read replicas.  TypeORM distributes read queries round-robin
     * across the slaves array.
     */
    replication: {
      master: {
        host: dbHost,
        port: dbPort,
        username: dbUsername,
        password: dbPassword,
        database: dbName,
      },
      slaves: [
        {
          host: readHost,
          port: readPort,
          username: dbUsername,
          password: dbPassword,
          database: dbName,
        },
      ],
    },
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],

    migrations: [
      __dirname + `/../../migrations/[0-9]*.${migrationExtension}`,
      __dirname + `/../migrations/[0-9]*.${migrationExtension}`,
    ],
    migrationsRun,

    synchronize,
    autoLoadEntities: true,
    extra: {
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
    logging: TRUE_VALUES.has(loggingSetting),
  };
};
