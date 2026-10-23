import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { User } from '../../src/user/entities/user.entity';
import { CryptoUtil } from '../../src/common/crypto.util';

export const describePostgres =
  process.env.PG_INTEGRATION === 'true' ||
  (process.env.CI === 'true' && process.env.DB_HOST)
    ? describe
    : describe.skip;

/** Each suite owns a schema; never drops or truncates the caller's tables. */
export async function createReliabilityDatabase(): Promise<DataSource> {
  const schema = `reliability_${randomUUID().replace(/-/g, '')}`;
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema,
    entities: [__dirname + '/../../src/**/*.entity.ts'],
    extra: {
      max: 25,
      options: `-c search_path=${schema},public -c statement_timeout=10000`,
    },
  });
  await ds.initialize();
  try {
    await ds.query(`CREATE SCHEMA "${schema}"`);
    await ds.synchronize();
    return ds;
  } catch (error) {
    await destroyReliabilityDatabase(ds);
    throw error;
  }
}

export async function destroyReliabilityDatabase(
  ds?: DataSource,
): Promise<void> {
  if (!ds?.isInitialized) return;
  try {
    await ds.query(
      `DROP SCHEMA "${(ds.options as { schema: string }).schema}" CASCADE`,
    );
  } finally {
    await ds.destroy();
  }
}

export async function createTestUser(ds: DataSource): Promise<User> {
  const username = `test_${randomUUID()}`;
  const email = `${username}@example.invalid`;
  const encrypted = CryptoUtil.encrypt(email);
  return ds.getRepository(User).save({
    username,
    password: 'synthetic-test-hash',
    emailEncrypted: encrypted.encrypted,
    emailIv: encrypted.iv,
    emailTag: encrypted.tag,
    emailHash: CryptoUtil.hash(email),
  });
}
