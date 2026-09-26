// src/config/typeorm.config.ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

/**
 * Default pool settings by environment
 * - local/dev: small pool, fast timeouts
 * - staging: medium pool
 * - production: large pool, tuned for replicas and traffic spikes
 */
interface PoolSettings {
  max: number;
  min: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  acquireTimeoutMillis?: number;
  reapIntervalMillis?: number;
  createRetryIntervalMillis?: number;
  createTimeoutMillis?: number;
}

const POOL_DEFAULTS: Record<string, PoolSettings> = {
  local: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    acquireTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
    createTimeoutMillis: 30000,
  },
  development: {
    max: 15,
    min: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
    createTimeoutMillis: 30000,
  },
  staging: {
    max: 30,
    min: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
    createTimeoutMillis: 30000,
  },
  production: {
    max: 50,
    min: 20,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
    acquireTimeoutMillis: 60000,
    reapIntervalMillis: 5000,
    createRetryIntervalMillis: 500,
    createTimeoutMillis: 60000,
  },
};

/**
 * Determine the environment key for pool settings
 */
function getEnvKey(nodeEnv: string, appEnv: string): keyof typeof POOL_DEFAULTS {
  const env = (nodeEnv || appEnv || 'local').toLowerCase();
  if (env === 'production' || env === 'prod') return 'production';
  if (env === 'staging' || env === 'stage') return 'staging';
  if (env === 'development' || env === 'dev') return 'development';
  return 'local';
}

/**
 * Calculate production pool size based on replica count
 * Each replica needs its own pool connections.
 * Formula: basePoolSize * (1 + replicaCount)
 * Where replicaCount is derived from DB_READ_REPLICAS or defaults to 1
 */
function calculateProductionPoolSize(configService: ConfigService, baseSize: number): number {
  const replicaCount = parseInt(configService.get<string>('DB_READ_REPLICAS') || '1', 10);
  const maxReplicas = Math.max(1, replicaCount);
  return baseSize * maxReplicas;
}

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

  // Determine environment and pool settings
  const envKey = getEnvKey(nodeEnv, appEnv);
  const defaults = POOL_DEFAULTS[envKey];

  // Allow environment variable overrides for all pool settings
  const poolMax = configService.get<string>('DB_POOL_MAX')
    ? parseInt(configService.get<string>('DB_POOL_MAX')!, 10)
    : (envKey === 'production' ? calculateProductionPoolSize(configService, defaults.max) : defaults.max);

  const poolMin = configService.get<string>('DB_POOL_MIN')
    ? parseInt(configService.get<string>('DB_POOL_MIN')!, 10)
    : defaults.min;

  const poolExtra: Record<string, any> = {
    max: poolMax,
    min: poolMin,
    idleTimeoutMillis: configService.get<string>('DB_IDLE_TIMEOUT_MS')
      ? parseInt(configService.get<string>('DB_IDLE_TIMEOUT_MS')!, 10)
      : defaults.idleTimeoutMillis,
    connectionTimeoutMillis: configService.get<string>('DB_CONN_TIMEOUT_MS')
      ? parseInt(configService.get<string>('DB_CONN_TIMEOUT_MS')!, 10)
      : defaults.connectionTimeoutMillis,
  };

  // Add production-specific pool tuning options
  if (defaults.acquireTimeoutMillis) {
    poolExtra.acquireTimeoutMillis = defaults.acquireTimeoutMillis;
  }
  if (defaults.reapIntervalMillis) {
    poolExtra.reapIntervalMillis = defaults.reapIntervalMillis;
  }
  if (defaults.createRetryIntervalMillis) {
    poolExtra.createRetryIntervalMillis = defaults.createRetryIntervalMillis;
  }
  if (defaults.createTimeoutMillis) {
    poolExtra.createTimeoutMillis = defaults.createTimeoutMillis;
  }

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
     *
     * PRODUCTION GUIDANCE:
     * - Set DB_READ_REPLICAS to the number of read replicas (default: 1)
     * - Set DB_POOL_MAX to max connections per replica (default: 50 per replica)
     *   Total connections = DB_POOL_MAX * (1 + DB_READ_REPLICAS)
     * - Ensure PostgreSQL max_connections >= total connections + buffer
     *   Recommended: max_connections >= DB_POOL_MAX * (1 + DB_READ_REPLICAS) + 50
     * - For Kubernetes deployments with N replicas, each pod gets its own pool
     *   Coordinate with DB admin to set appropriate max_connections
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
    extra: poolExtra,
    logging: TRUE_VALUES.has(loggingSetting),
  };
};
