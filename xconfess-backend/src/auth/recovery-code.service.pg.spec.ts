/**
 * Recovery code lifecycle against a disposable PostgreSQL database using the
 * real migration. Runs when PG_INTEGRATION=true (or in CI with DB_HOST).
 */
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { RecoveryCodeService } from './recovery-code.service';
import { UserRecoveryCode } from './entities/user-recovery-code.entity';
import { User } from '../user/entities/user.entity';
import { CryptoUtil } from '../common/crypto.util';
import { CreateUserRecoveryCodes20261119000002 } from '../migrations/20261119000002-create-user-recovery-codes';

const shouldRun =
  process.env.PG_INTEGRATION === 'true' ||
  (process.env.CI === 'true' && Boolean(process.env.DB_HOST));
const describePostgres = shouldRun ? describe : describe.skip;

const base = {
  type: 'postgres' as const,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
};

function memoryCache() {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => void store.set(key, value),
    del: async (key: string) => void store.delete(key),
  };
}

describePostgres('RecoveryCodeService (PostgreSQL)', () => {
  const databaseName = `xconfess_recovery_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  let admin: DataSource;
  let ds: DataSource;
  let service: RecoveryCodeService;
  let audit: { log: jest.Mock };
  let nextUserId = 1;

  const createUser = async (legacyCodes?: string[]) => {
    const id = nextUserId++;
    const legacy = legacyCodes ? CryptoUtil.encrypt(JSON.stringify(legacyCodes)) : null;
    await ds.query(
      `INSERT INTO "user" ("id", "recovery_codes_encrypted", "recovery_codes_iv", "recovery_codes_tag")
       VALUES ($1, $2, $3, $4)`,
      [id, legacy?.encrypted ?? null, legacy?.iv ?? null, legacy?.tag ?? null],
    );
    return id;
  };

  const user = { type: 'user' as const, id: 0 };

  beforeAll(async () => {
    admin = new DataSource({ ...base, database: process.env.DB_NAME ?? 'postgres' });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    ds = new DataSource({
      ...base,
      database: databaseName,
      entities: [__dirname + '/../**/*.entity.{ts,js}'],
      migrations: [CreateUserRecoveryCodes20261119000002],
      synchronize: false,
    });
    await ds.initialize();
    // Only the columns this service touches; the full user table is not needed.
    await ds.query(`
      CREATE TABLE "user" (
        "id" integer PRIMARY KEY,
        "recovery_codes_encrypted" text,
        "recovery_codes_iv" varchar(64),
        "recovery_codes_tag" varchar(64),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await ds.runMigrations();

    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new RecoveryCodeService(
      ds.getRepository(UserRecoveryCode),
      ds.getRepository(User),
      memoryCache() as any,
      audit as any,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.destroy();
    }
  });

  it('stores only hashes and accepts each code once', async () => {
    const userId = await createUser();
    const { codes } = await service.generateForUser(userId, { ...user, id: userId }, 'setup');

    const rows: Array<{ code_hash: string }> = await ds.query(
      'SELECT "code_hash" FROM "user_recovery_codes" WHERE "user_id" = $1',
      [userId],
    );
    expect(rows).toHaveLength(10);
    const stored = JSON.stringify(rows);
    for (const code of codes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replace('-', ''));
    }

    await expect(service.verifyAndConsume(userId, codes[0])).resolves.toBe(true);
    await expect(service.verifyAndConsume(userId, codes[0])).resolves.toBe(false);
    await expect(service.getStatus(userId)).resolves.toMatchObject({
      enabled: true,
      total: 10,
      remaining: 9,
    });
  });

  it('invalidates every prior code on regeneration', async () => {
    const userId = await createUser();
    const first = await service.generateForUser(userId, { ...user, id: userId }, 'setup');
    const second = await service.generateForUser(userId, { ...user, id: userId }, 'regenerate');

    expect(second.revokedCount).toBe(10);
    await expect(service.verifyAndConsume(userId, first.codes[1])).resolves.toBe(false);
    await expect(service.verifyAndConsume(userId, second.codes[1])).resolves.toBe(true);
    await expect(service.getStatus(userId)).resolves.toMatchObject({ total: 10, remaining: 9 });
  });

  it('lets exactly one of several concurrent redemptions of a code succeed', async () => {
    const userId = await createUser();
    const { codes } = await service.generateForUser(userId, { ...user, id: userId }, 'setup');

    const results = await Promise.all(
      Array.from({ length: 4 }, () => service.verifyAndConsume(userId, codes[2])),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('revokes all codes (admin) and reports none remaining', async () => {
    const userId = await createUser();
    const { codes } = await service.generateForUser(userId, { ...user, id: userId }, 'setup');

    await expect(
      service.revokeAll(userId, { type: 'admin', id: 999 }, 'admin_revoked'),
    ).resolves.toEqual({ revokedCount: 10 });
    await expect(service.verifyAndConsume(userId, codes[3])).resolves.toBe(false);
    await expect(service.getStatus(userId)).resolves.toMatchObject({
      enabled: false,
      remaining: 0,
    });
  });

  it('converts legacy encrypted codes to hashes and clears the plaintext copy', async () => {
    // Legacy codes were 8 base-36 characters.
    const userId = await createUser(['K3J9X0QA', 'P1Z8M2LB']);

    await expect(service.verifyAndConsume(userId, 'k3j9x0qa')).resolves.toBe(true);
    await expect(service.verifyAndConsume(userId, 'K3J9X0QA')).resolves.toBe(false);
    const [row] = await ds.query(
      'SELECT "recovery_codes_encrypted" FROM "user" WHERE "id" = $1',
      [userId],
    );
    expect(row.recovery_codes_encrypted).toBeNull();
    const hashed = await ds.query(
      'SELECT count(*)::int AS n FROM "user_recovery_codes" WHERE "user_id" = $1',
      [userId],
    );
    expect(hashed[0].n).toBe(2);
    await expect(service.verifyAndConsume(userId, 'P1Z8M2LB')).resolves.toBe(true);
  });

  it('deletes codes with the user (ON DELETE CASCADE)', async () => {
    const userId = await createUser();
    await service.generateForUser(userId, { ...user, id: userId }, 'setup');
    await ds.query('DELETE FROM "user" WHERE "id" = $1', [userId]);

    const [{ n }] = await ds.query(
      'SELECT count(*)::int AS n FROM "user_recovery_codes" WHERE "user_id" = $1',
      [userId],
    );
    expect(n).toBe(0);
  });
});
