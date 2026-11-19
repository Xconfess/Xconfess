import { HttpException, HttpStatus } from '@nestjs/common';
import { AuditActionType } from '../audit-log/audit-log.entity';
import {
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
  RECOVERY_MAX_FAILED_ATTEMPTS,
  RecoveryCodeService,
} from './recovery-code.service';

/** Minimal cache-manager stand-in backed by a Map. */
function memoryCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

interface Row {
  id: string;
  userId: number;
  batchId: string;
  codeHash: string;
  usedAt: Date | null;
  revokedAt: Date | null;
}

function buildService(rows: Row[] = []) {
  const cache = memoryCache();
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const codes = {
    find: jest.fn(async () =>
      rows.filter((r) => r.usedAt === null && r.revokedAt === null),
    ),
    update: jest.fn(async (criteria: { id: string }) => {
      const row = rows.find((r) => r.id === criteria.id);
      if (!row || row.usedAt || row.revokedAt) return { affected: 0 };
      row.usedAt = new Date();
      return { affected: 1 };
    }),
    manager: { transaction: jest.fn() },
  };
  // No legacy codes for these unit tests.
  const users = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
  const service = new RecoveryCodeService(
    codes as any,
    users as any,
    cache as any,
    auditLog as any,
  );
  return { service, cache, auditLog, codes, rows };
}

describe('RecoveryCodeService', () => {
  describe('code generation', () => {
    it('generates unique, formatted codes from a CSPRNG alphabet', () => {
      const { service } = buildService();
      const codes = service.generatePlaintextCodes();

      expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
      expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
      for (const code of codes) {
        expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
      }
    });

    it('normalizes case and separators', () => {
      expect(normalizeRecoveryCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
    });
  });

  describe('hashing', () => {
    it('stores a salted scrypt hash that never contains the code', async () => {
      const { service } = buildService();
      const code = 'ABCDE-FGHJK';
      const first = await service.hashCode(code);
      const second = await service.hashCode(code);

      expect(first).toMatch(/^scrypt\$4096\$8\$1\$/);
      expect(first).not.toContain('ABCDE');
      expect(first).not.toContain('ABCDEFGHJK');
      expect(first).not.toBe(second); // random salt
      await expect(service.verifyHash('abcde fghjk', first)).resolves.toBe(true);
      await expect(service.verifyHash('ABCDE-FGHJM', first)).resolves.toBe(false);
    });

    it('rejects tampered or unknown hash formats without throwing', async () => {
      const { service } = buildService();
      const hash = await service.hashCode('ABCDE-FGHJK');
      const expensive = hash.replace('$4096$', '$1048576$');

      await expect(service.verifyHash('ABCDE-FGHJK', expensive)).resolves.toBe(false);
      await expect(service.verifyHash('ABCDE-FGHJK', 'plain:ABCDEFGHJK')).resolves.toBe(false);
    });
  });

  describe('verifyAndConsume', () => {
    async function seeded(codes: string[]) {
      const ctx = buildService();
      for (const [index, code] of codes.entries()) {
        ctx.rows.push({
          id: `row-${index}`,
          userId: 1,
          batchId: 'batch-1',
          codeHash: await ctx.service.hashCode(code),
          usedAt: null,
          revokedAt: null,
        });
      }
      return ctx;
    }

    it('accepts a valid code exactly once', async () => {
      const { service, auditLog } = await seeded(['AAAAA-BBBBB', 'CCCCC-DDDDD']);

      await expect(service.verifyAndConsume(1, 'aaaaa-bbbbb')).resolves.toBe(true);
      await expect(service.verifyAndConsume(1, 'AAAAA-BBBBB')).resolves.toBe(false);

      const used = auditLog.log.mock.calls.find(
        ([e]) => e.actionType === AuditActionType.TWO_FACTOR_RECOVERY_CODE_USED,
      );
      expect(used?.[0].metadata).toMatchObject({ batchId: 'batch-1', remaining: 1 });
    });

    it('fails safely when a concurrent request redeemed the code first', async () => {
      const { service, codes } = await seeded(['AAAAA-BBBBB']);
      codes.update.mockResolvedValueOnce({ affected: 0 });

      await expect(service.verifyAndConsume(1, 'AAAAA-BBBBB')).resolves.toBe(false);
    });

    it('rejects malformed input without hashing anything', async () => {
      const { service, codes } = await seeded(['AAAAA-BBBBB']);

      await expect(service.verifyAndConsume(1, 'not-a-code!')).resolves.toBe(false);
      await expect(service.verifyAndConsume(1, 'ABC')).resolves.toBe(false);
      await expect(service.verifyAndConsume(1, 'A'.repeat(64))).resolves.toBe(false);
      expect(codes.find).not.toHaveBeenCalled();
    });

    it(`locks verification after ${RECOVERY_MAX_FAILED_ATTEMPTS} failures`, async () => {
      const { service, codes } = await seeded(['AAAAA-BBBBB']);

      for (let i = 0; i < RECOVERY_MAX_FAILED_ATTEMPTS; i++) {
        await expect(service.verifyAndConsume(1, 'ZZZZZ-ZZZZZ')).resolves.toBe(false);
      }

      const error = await service
        .verifyAndConsume(1, 'AAAAA-BBBBB')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).getResponse()).toMatchObject({
        retryAfter: expect.any(Number),
      });
      // Even the correct code is refused while locked, and not consumed.
      expect(codes.update).not.toHaveBeenCalled();
    });

    it('rate limits per user, not globally', async () => {
      const { service } = await seeded(['AAAAA-BBBBB']);
      for (let i = 0; i < RECOVERY_MAX_FAILED_ATTEMPTS; i++) {
        await service.verifyAndConsume(2, 'ZZZZZ-ZZZZZ');
      }

      await expect(service.verifyAndConsume(1, 'AAAAA-BBBBB')).resolves.toBe(true);
    });

    it('resets the failure counter after a successful redemption', async () => {
      const { service, cache } = await seeded(['AAAAA-BBBBB']);
      await service.verifyAndConsume(1, 'ZZZZZ-ZZZZZ');
      expect(cache.store.get('2fa:recovery:failures:1')).toBe('1');

      await service.verifyAndConsume(1, 'AAAAA-BBBBB');
      expect(cache.store.has('2fa:recovery:failures:1')).toBe(false);
    });

    it('audits failures and successes without exposing codes or hashes', async () => {
      const { service, auditLog, rows } = await seeded(['AAAAA-BBBBB']);
      await service.verifyAndConsume(1, 'QQQQQ-QQQQQ');
      await service.verifyAndConsume(1, 'AAAAA-BBBBB');

      const actions = auditLog.log.mock.calls.map(([e]) => e.actionType);
      expect(actions).toEqual([
        AuditActionType.TWO_FACTOR_RECOVERY_CODE_FAILED,
        AuditActionType.TWO_FACTOR_RECOVERY_CODE_USED,
      ]);
      const serialized = JSON.stringify(auditLog.log.mock.calls);
      expect(serialized).not.toMatch(/QQQQQ|AAAAA|BBBBB/);
      expect(serialized).not.toContain(rows[0].codeHash);
    });

    it('still authenticates when the audit log is unavailable', async () => {
      const { service, auditLog } = await seeded(['AAAAA-BBBBB']);
      auditLog.log.mockRejectedValue(new Error('audit db down'));

      await expect(service.verifyAndConsume(1, 'AAAAA-BBBBB')).resolves.toBe(true);
    });
  });
});
