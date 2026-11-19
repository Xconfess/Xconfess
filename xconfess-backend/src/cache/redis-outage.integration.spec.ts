import { randomUUID } from 'node:crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheModule } from './cache.module';
import { CacheService } from './cache.service';
import {
  RedisCacheStore,
  REDIS_OPERATION_TIMEOUT_MS,
} from './redis-cache.store';
import { LockoutService } from '../auth/lockout.service';
import { SessionRevocationService } from '../auth/session-revocation.service';
import { TcpFaultProxy, eventually } from '../../test/utils/tcp-fault-proxy';

const describeRedis =
  process.env.REDIS_INTEGRATION === 'true' ||
  (process.env.CI === 'true' && process.env.REDIS_HOST)
    ? describe
    : describe.skip;

describeRedis(
  'Redis outages through the production cache module (#2346)',
  () => {
    let proxy: TcpFaultProxy;
    let module: TestingModule;
    let store: RedisCacheStore;
    let cache: CacheService;
    let sessions: SessionRevocationService;
    let lockout: LockoutService;
    let key: string;

    beforeEach(async () => {
      key = randomUUID();
      proxy = new TcpFaultProxy(
        process.env.REDIS_HOST!,
        Number(process.env.REDIS_PORT),
      );
      const port = await proxy.start();
      module = await Test.createTestingModule({ imports: [CacheModule] })
        .overrideProvider(ConfigService)
        .useValue(
          new ConfigService({ REDIS_HOST: '127.0.0.1', REDIS_PORT: port }),
        )
        .compile();
      await module.init();
      store = module.get(CACHE_MANAGER);
      cache = module.get(CacheService);
      sessions = new SessionRevocationService(
        { findOne: async () => ({ id: key }) } as any,
        store as any,
      );
      lockout = new LockoutService(store as any);
    });

    afterEach(async () => {
      await module?.close();
      await proxy?.close();
      const cleanup = new RedisCacheStore(
        new ConfigService({
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
        }),
      );
      try {
        await cleanup.onModuleInit();
        await cleanup.del(`session:revoked:${key}`);
      } finally {
        cleanup.onModuleDestroy();
      }
      jest.restoreAllMocks();
    });

    it('shares security state across independent clients and preserves TTL units', async () => {
      const second = new RedisCacheStore(
        new ConfigService({
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
        }),
      );
      await second.onModuleInit();
      try {
        await store.set(key, { value: 'shared' }, 60000);
        expect(await second.get(key)).toEqual({ value: 'shared' });
        const ttl = await store.client.pttl(key);
        expect(ttl).toBeGreaterThan(55000);
        expect(ttl).toBeLessThanOrEqual(60000);
        await cache.set(`feed:${key}`, { data: [] }, 60);
        expect(await store.client.pttl(`feed:${key}`)).toBeGreaterThan(55000);
        await lockout.recordFailedAttempt(`${key}@example.invalid`);
        expect(
          await second.get(`lockout:attempts:${key}@example.invalid`),
        ).toBe('1');
        expect(
          await store.client.pttl(`lockout:attempts:${key}@example.invalid`),
        ).toBeGreaterThan(1790000);
      } finally {
        await second.del(key);
        await second.del(`feed:${key}`);
        await second.del(`lockout:attempts:${key}@example.invalid`);
        second.onModuleDestroy();
      }
    });

    it('treats optional caching as a miss but rejects lockout and session operations after disconnect', async () => {
      await sessions.revokeUserSessions(key);
      await proxy.close();
      await eventually(() => expect(store.client.status).not.toBe('ready'));
      const start = Date.now();
      await expect(cache.get(`feed:${key}`)).resolves.toBeNull();
      await expect(
        cache.set(`feed:${key}`, { data: [] }),
      ).resolves.toBeUndefined();
      await expect(cache.del(`feed:${key}`)).resolves.toBeUndefined();
      await expect(sessions.isSessionValid(key, 0)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(sessions.revokeUserSessions(key)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(sessions.clearSessionRevocation(key)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(
        lockout.getStatus(`${key}@example.invalid`),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(
        lockout.recordFailedAttempt(`${key}@example.invalid`),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(Date.now() - start).toBeLessThan(REDIS_OPERATION_TIMEOUT_MS * 2);
    });

    it('bounds a stalled Redis command and keeps private keys and errors out of logs', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn');
      const error = jest.spyOn(Logger.prototype, 'error');
      proxy.stall();
      const start = Date.now();
      await expect(
        store.get(`lockout:attempts:private-${key}@example.invalid`),
      ).rejects.toThrow('Shared cache unavailable');
      expect(Date.now() - start).toBeLessThan(REDIS_OPERATION_TIMEOUT_MS * 2);
      await expect(cache.get(`private-${key}`)).resolves.toBeNull();
      expect(
        JSON.stringify([...warn.mock.calls, ...error.mock.calls]),
      ).not.toContain(key);
    }, 10000);

    it('recovers without a process-local replacement cache or losing revocation state', async () => {
      await sessions.revokeUserSessions(key);
      // Force a socket failure; the production client reconnects to the same proxy.
      proxy.disconnect();
      await eventually(() => expect(store.client.status).not.toBe('ready'));
      await expect(sessions.isSessionValid(key, 0)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await eventually(async () =>
        expect(await sessions.isSessionValid(key, 0)).toBe(false),
      );
      expect(
        await sessions.isSessionValid(key, Math.ceil(Date.now() / 1000) + 1),
      ).toBe(true);
      await sessions.clearSessionRevocation(key);
    });
  },
);
