import { randomUUID } from 'node:crypto';
import { DataSource, EntitySchema, Repository } from 'typeorm';
import {
  computeScopedIdempotencyKey,
  DEFAULT_IDEMPOTENCY_SCOPE,
} from './idempotency-scope';
import { ConfessionIdempotencyService } from './confession-idempotency.service';
import { AnonymousConfession } from './entities/confession.entity';

const runWithPostgres =
  process.env.CI === 'true' && process.env.DB_HOST ? describe : describe.skip;

class TestIdempotencyRecord {
  id: string;
  idempotencyKey: string;
  payloadHash: string;
  status: 'processing' | 'completed' | 'failed';
  responseStatus: number | null;
  responseBody: object | null;
  confessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

function buildTempTableName(prefix = 'test_confession_idem'): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

runWithPostgres(
  'confession idempotency scoping – PostgreSQL concurrency',
  () => {
    let dataSource: DataSource;
    let recordRepo: Repository<TestIdempotencyRecord>;
    let idempotencyService: ConfessionIdempotencyService;
    const tableName = buildTempTableName();

    beforeAll(async () => {
      const recordSchema = new EntitySchema<TestIdempotencyRecord>({
        name: 'TestIdempotencyRecord',
        target: TestIdempotencyRecord,
        tableName,
        columns: {
          id: { type: 'uuid', primary: true, generated: 'uuid' },
          idempotencyKey: {
            name: 'idempotency_key',
            type: 'varchar',
            length: 255,
            unique: true,
          },
          payloadHash: { name: 'payload_hash', type: 'varchar', length: 64 },
          status: { type: 'varchar', length: 16, default: 'processing' },
          responseStatus: {
            name: 'response_status',
            type: 'int',
            nullable: true,
          },
          responseBody: { name: 'response_body', type: 'jsonb', nullable: true },
          confessionId: { name: 'confession_id', type: 'uuid', nullable: true },
          createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
          updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
          expiresAt: {
            name: 'expires_at',
            type: 'timestamptz',
            default: () => "now() + interval '24 hours'",
          },
        },
      });
      dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [recordSchema],
        synchronize: false,
      });
      await dataSource.initialize();
      await dataSource.query(
        `CREATE TABLE "${tableName}" (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          idempotency_key varchar(255) NOT NULL UNIQUE,
          payload_hash varchar(64) NOT NULL,
          status varchar(16) NOT NULL DEFAULT 'processing',
          response_status int NULL,
          response_body jsonb NULL,
          confession_id uuid NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
        )`,
      );
      recordRepo = dataSource.getRepository(TestIdempotencyRecord);
      const cachedConfession = {
        id: '00000000-0000-0000-0000-000000000001',
      };
      const serviceDataSource = {
        getRepository: (target: unknown) =>
          target === AnonymousConfession
            ? { findOne: jest.fn().mockResolvedValue(cachedConfession) }
            : dataSource.getRepository(target as any),
      } as DataSource;
      idempotencyService = new ConfessionIdempotencyService(
        recordRepo,
        serviceDataSource,
      );
    });

    beforeEach(async () => {
      await dataSource.query(`TRUNCATE TABLE "${tableName}"`);
    });

    afterAll(async () => {
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP TABLE IF EXISTS "${tableName}"`);
        await dataSource.destroy();
      }
    });

    it('concurrent retries return replay after first commits', async () => {
      const clientKey = 'client-key-xyz-123';
      const payloadHash = 'a'.repeat(64);
      const scope = DEFAULT_IDEMPOTENCY_SCOPE;
      const scopedKey = computeScopedIdempotencyKey(clientKey, scope);

      const firstRequest = await idempotencyService.check(
        clientKey,
        payloadHash,
        scope,
      );
      const retryRequest = idempotencyService.check(
        clientKey,
        payloadHash,
        scope,
      );

      expect(firstRequest.isReplay).toBe(false);
      await idempotencyService.commitSuccess(
        firstRequest.record,
        { id: '00000000-0000-0000-0000-000000000001' } as AnonymousConfession,
        { id: '00000000-0000-0000-0000-000000000001', message: 'hello' },
        201,
      );

      const replay = await retryRequest;
      expect(replay.isReplay).toBe(true);
      expect(replay.cachedStatus).toBe(201);
      expect(replay.cachedResponse?.id).toBe(
        '00000000-0000-0000-0000-000000000001',
      );
      expect(await recordRepo.count()).toBe(1);
      expect(scopedKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('different sessions with same client key produce different stored keys', () => {
      const clientKey = 'shared-key-abc';
      const scopeA = {
        operation: DEFAULT_IDEMPOTENCY_SCOPE.operation,
        sessionId: 'user:1',
      };
      const scopeB = {
        operation: DEFAULT_IDEMPOTENCY_SCOPE.operation,
        sessionId: 'user:2',
      };
      const a = computeScopedIdempotencyKey(clientKey, scopeA);
      const b = computeScopedIdempotencyKey(clientKey, scopeB);
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(b).toMatch(/^[0-9a-f]{64}$/);
    });

    it('same client key in same scope always hashes to the same stored key', () => {
      const clientKey = 'det-key';
      const scope = DEFAULT_IDEMPOTENCY_SCOPE;
      const a = computeScopedIdempotencyKey(clientKey, scope);
      const b = computeScopedIdempotencyKey(clientKey, scope);
      expect(a).toBe(b);
    });
  },
);
