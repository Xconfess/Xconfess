import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file from the backend directory
dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.DB_HOST || !process.env.DB_PORT || !process.env.DB_USERNAME || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  throw new Error('Missing required database environment variables');
}

const dbPort = parseInt(process.env.DB_PORT, 10);
if (isNaN(dbPort)) {
  throw new Error('DB_PORT must be a valid number');
}

const readHost = process.env.DB_READ_HOST || process.env.DB_HOST;
const readPort = parseInt(process.env.DB_READ_PORT || process.env.DB_PORT, 10);

// Environment detection
const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const appEnv = (process.env.APP_ENV || '').toLowerCase();
const isLocalDevEnv =
  nodeEnv === 'development' ||
  nodeEnv === 'dev' ||
  nodeEnv === 'local' ||
  appEnv === 'development' ||
  appEnv === 'dev' ||
  appEnv === 'local';

// Pool settings by environment
const POOL_DEFAULTS: Record<string, any> = {
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

function getEnvKey(): keyof typeof POOL_DEFAULTS {
  const env = (nodeEnv || appEnv || 'local').toLowerCase();
  if (env === 'production' || env === 'prod') return 'production';
  if (env === 'staging' || env === 'stage') return 'staging';
  if (env === 'development' || env === 'dev') return 'development';
  return 'local';
}

function calculateProductionPoolSize(baseSize: number): number {
  const replicaCount = parseInt(process.env.DB_READ_REPLICAS || '1', 10);
  const maxReplicas = Math.max(1, replicaCount);
  return baseSize * maxReplicas;
}

const envKey = getEnvKey();
const defaults = POOL_DEFAULTS[envKey];

const poolMax = process.env.DB_POOL_MAX
  ? parseInt(process.env.DB_POOL_MAX, 10)
  : (envKey === 'production' ? calculateProductionPoolSize(defaults.max) : defaults.max);

const poolMin = process.env.DB_POOL_MIN
  ? parseInt(process.env.DB_POOL_MIN, 10)
  : defaults.min;

const poolExtra: Record<string, any> = {
  max: poolMax,
  min: poolMin,
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT_MS
    ? parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10)
    : defaults.idleTimeoutMillis,
  connectionTimeoutMillis: process.env.DB_CONN_TIMEOUT_MS
    ? parseInt(process.env.DB_CONN_TIMEOUT_MS, 10)
    : defaults.connectionTimeoutMillis,
};

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

export default new DataSource({
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
      host: process.env.DB_HOST,
      port: dbPort,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    },
    slaves: [
      {
        host: readHost,
        port: readPort,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      },
    ],
  },
  entities: [__dirname + '/src/**/*.entity.{ts,js}'],
  migrations: [
    __dirname + '/migrations/[0-9]*{.ts,.js}',
    __dirname + '/src/migrations/[0-9]*{.ts,.js}',
  ],
  extra: poolExtra,
});
