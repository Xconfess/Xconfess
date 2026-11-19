import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { randomInt, randomUUID, scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { IsNull, Repository } from 'typeorm';
import { UserRecoveryCode } from './entities/user-recovery-code.entity';
import { User } from '../user/entities/user.entity';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CryptoUtil } from '../common/crypto.util';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Number of codes in a batch. */
export const RECOVERY_CODE_COUNT = 10;

/** Crockford base32 (no I, L, O, U): unambiguous when read aloud or typed. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** 10 characters x 5 bits = 50 bits of entropy per code. */
const CODE_LENGTH = 10;

/** scrypt cost: memory-hard, ~a few ms per hash, bounded per verification. */
const SCRYPT = { N: 1 << 12, r: 8, p: 1, keylen: 32 } as const;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;

/** Verification rate limit (per user, independent of IP). */
export const RECOVERY_MAX_FAILED_ATTEMPTS = 5;
export const RECOVERY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const RECOVERY_LOCKOUT_MS = 15 * 60 * 1000;

const failuresKey = (userId: number) => `2fa:recovery:failures:${userId}`;
const lockKey = (userId: number) => `2fa:recovery:locked:${userId}`;

export interface RecoveryCodeActor {
  type: 'user' | 'admin' | 'system';
  id: number | string;
}

export interface RecoveryCodeContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface RecoveryCodeStatus {
  enabled: boolean;
  total: number;
  remaining: number;
  generatedAt: string | null;
}

export type GenerationReason = 'setup' | 'regenerate';
export type RevocationReason = 'admin_revoked' | 'two_factor_disabled' | 'user_revoked';

/** Uppercase and drop separators so `abcde-fghjk` and `ABCDEFGHJK` match. */
export function normalizeRecoveryCode(code: string): string {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

function formatCode(raw: string): string {
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/**
 * Two-factor recovery code lifecycle: generation, single-use redemption,
 * rotation and revocation. Codes are stored only as salted scrypt hashes and
 * never appear in logs or audit entries.
 */
@Injectable()
export class RecoveryCodeService {
  private readonly logger = new Logger(RecoveryCodeService.name);

  constructor(
    @InjectRepository(UserRecoveryCode)
    private readonly codes: Repository<UserRecoveryCode>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Hashing ──────────────────────────────────────────────────────────

  async hashCode(code: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scryptAsync(normalizeRecoveryCode(code), salt, SCRYPT.keylen, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
      maxmem: SCRYPT_MAXMEM,
    });
    return [
      'scrypt',
      SCRYPT.N,
      SCRYPT.r,
      SCRYPT.p,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
  }

  async verifyHash(code: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    const N = Number(n);
    const R = Number(r);
    const P = Number(p);
    // Refuse parameters outside what we generate, so a tampered row cannot
    // make verification arbitrarily expensive.
    if (N !== SCRYPT.N || R !== SCRYPT.r || P !== SCRYPT.p || expected.length !== SCRYPT.keylen) {
      return false;
    }
    const derived = await scryptAsync(
      normalizeRecoveryCode(code),
      Buffer.from(saltB64, 'base64'),
      expected.length,
      { N, r: R, p: P, maxmem: SCRYPT_MAXMEM },
    );
    return timingSafeEqual(derived, expected);
  }

  generatePlaintextCodes(count = RECOVERY_CODE_COUNT): string[] {
    const codes = new Set<string>();
    while (codes.size < count) {
      let raw = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        raw += ALPHABET[randomInt(ALPHABET.length)];
      }
      codes.add(formatCode(raw));
    }
    return [...codes];
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Create a fresh batch and invalidate every previous code (hashed or
   * legacy). Returns the plaintext codes — the only time they exist.
   */
  async generateForUser(
    userId: number,
    actor: RecoveryCodeActor,
    reason: GenerationReason,
    context: RecoveryCodeContext = {},
  ): Promise<{ codes: string[]; batchId: string; revokedCount: number }> {
    const plaintext = this.generatePlaintextCodes();
    const hashes = await Promise.all(plaintext.map((code) => this.hashCode(code)));
    const batchId = randomUUID();

    const revokedCount = await this.codes.manager.transaction(async (manager) => {
      const revoked = await manager.update(
        UserRecoveryCode,
        { userId, usedAt: IsNull(), revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await this.clearLegacyCodes(userId, manager.getRepository(User));
      await manager.insert(
        UserRecoveryCode,
        hashes.map((codeHash) => ({ userId, batchId, codeHash })),
      );
      return revoked.affected ?? 0;
    });

    await this.resetFailures(userId);
    await this.audit(AuditActionType.TWO_FACTOR_RECOVERY_CODES_GENERATED, userId, actor, context, {
      reason,
      batchId,
      count: plaintext.length,
      revokedCount,
    });

    return { codes: plaintext, batchId, revokedCount };
  }

  /**
   * Redeem a recovery code. Rate limited per user; a code can succeed at most
   * once even under concurrent requests (conditional UPDATE).
   */
  async verifyAndConsume(
    userId: number,
    code: string,
    context: RecoveryCodeContext = {},
  ): Promise<boolean> {
    await this.assertNotLocked(userId);

    const actor: RecoveryCodeActor = { type: 'user', id: userId };
    const normalized = normalizeRecoveryCode(code);
    // Current codes are 10 characters; legacy codes were 8. Anything else is
    // rejected without spending hash work.
    if (!/^[0-9A-Z]{6,16}$/.test(normalized)) {
      await this.recordFailure(userId, actor, context, 'malformed');
      return false;
    }

    await this.migrateLegacyCodes(userId);

    const active = await this.codes.find({
      where: { userId, usedAt: IsNull(), revokedAt: IsNull() },
      select: { id: true, codeHash: true, batchId: true },
    });

    let matched: UserRecoveryCode | undefined;
    // Check every active code so timing does not reveal which one matched.
    for (const candidate of active) {
      if ((await this.verifyHash(normalized, candidate.codeHash)) && !matched) {
        matched = candidate;
      }
    }

    if (!matched) {
      await this.recordFailure(userId, actor, context, 'no_match');
      return false;
    }

    const consumed = await this.codes.update(
      { id: matched.id, usedAt: IsNull(), revokedAt: IsNull() },
      { usedAt: new Date() },
    );
    if ((consumed.affected ?? 0) !== 1) {
      // Another request redeemed (or revoked) this code first.
      await this.recordFailure(userId, actor, context, 'already_used');
      return false;
    }

    await this.resetFailures(userId);
    await this.audit(AuditActionType.TWO_FACTOR_RECOVERY_CODE_USED, userId, actor, context, {
      batchId: matched.batchId,
      remaining: active.length - 1,
    });
    return true;
  }

  /** Invalidate every active code for a user (admin action or 2FA disable). */
  async revokeAll(
    userId: number,
    actor: RecoveryCodeActor,
    reason: RevocationReason,
    context: RecoveryCodeContext = {},
  ): Promise<{ revokedCount: number }> {
    const revokedCount = await this.codes.manager.transaction(async (manager) => {
      const revoked = await manager.update(
        UserRecoveryCode,
        { userId, usedAt: IsNull(), revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      const legacyCleared = await this.clearLegacyCodes(userId, manager.getRepository(User));
      return (revoked.affected ?? 0) + (legacyCleared ? 1 : 0);
    });

    await this.audit(AuditActionType.TWO_FACTOR_RECOVERY_CODES_REVOKED, userId, actor, context, {
      reason,
      revokedCount,
    });
    return { revokedCount };
  }

  /** Counts only — never the codes or their hashes. */
  async getStatus(userId: number): Promise<RecoveryCodeStatus> {
    await this.migrateLegacyCodes(userId);

    const latest = await this.codes.findOne({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
      select: { batchId: true, createdAt: true },
    });
    if (!latest) {
      return { enabled: false, total: 0, remaining: 0, generatedAt: null };
    }

    const [total, remaining] = await Promise.all([
      this.codes.count({ where: { userId, batchId: latest.batchId } }),
      this.codes.count({
        where: { userId, batchId: latest.batchId, usedAt: IsNull(), revokedAt: IsNull() },
      }),
    ]);
    return {
      enabled: remaining > 0,
      total,
      remaining,
      generatedAt: latest.createdAt.toISOString(),
    };
  }

  // ── Rate limiting ────────────────────────────────────────────────────

  private async assertNotLocked(userId: number): Promise<void> {
    const lockedUntil = await this.cache.get<string>(lockKey(userId));
    if (!lockedUntil) return;
    const retryAfter = Math.max(
      1,
      Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000),
    );
    throw new AppException(
      'Too many recovery code attempts. Try again later.',
      ErrorCode.RATE_LIMIT_EXCEEDED,
      HttpStatus.TOO_MANY_REQUESTS,
      undefined,
      retryAfter,
    );
  }

  private async recordFailure(
    userId: number,
    actor: RecoveryCodeActor,
    context: RecoveryCodeContext,
    reason: 'malformed' | 'no_match' | 'already_used',
  ): Promise<void> {
    const attempts = Number((await this.cache.get<string>(failuresKey(userId))) ?? 0) + 1;
    const locked = attempts >= RECOVERY_MAX_FAILED_ATTEMPTS;

    if (locked) {
      const until = new Date(Date.now() + RECOVERY_LOCKOUT_MS);
      await this.cache.set(lockKey(userId), until.toISOString(), RECOVERY_LOCKOUT_MS);
      await this.cache.del(failuresKey(userId));
    } else {
      await this.cache.set(failuresKey(userId), String(attempts), RECOVERY_ATTEMPT_WINDOW_MS);
    }

    await this.audit(AuditActionType.TWO_FACTOR_RECOVERY_CODE_FAILED, userId, actor, context, {
      reason,
      attempt: attempts,
      locked,
    });
  }

  private async resetFailures(userId: number): Promise<void> {
    await this.cache.del(failuresKey(userId));
  }

  // ── Legacy (encrypted plaintext) codes ───────────────────────────────

  /**
   * Older accounts kept recovery codes as an encrypted JSON array. Convert
   * them to hashes once and clear the encrypted copy, so plaintext codes are
   * no longer recoverable from the database.
   */
  private async migrateLegacyCodes(userId: number): Promise<void> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, recoveryCodesEncrypted: true, recoveryCodesIv: true, recoveryCodesTag: true },
    });
    if (!user?.recoveryCodesEncrypted) return;

    let legacy: string[] = [];
    try {
      const decrypted = CryptoUtil.decrypt(
        user.recoveryCodesEncrypted,
        user.recoveryCodesIv || '',
        user.recoveryCodesTag || '',
      );
      const parsed: unknown = JSON.parse(decrypted);
      legacy = Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
    } catch {
      this.logger.warn(`Discarding unreadable legacy recovery codes for user ${userId}`);
    }

    const hashes = await Promise.all(legacy.map((code) => this.hashCode(code)));
    const batchId = randomUUID();
    await this.codes.manager.transaction(async (manager) => {
      if (hashes.length > 0) {
        await manager.update(
          UserRecoveryCode,
          { userId, usedAt: IsNull(), revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        await manager.insert(
          UserRecoveryCode,
          hashes.map((codeHash) => ({ userId, batchId, codeHash })),
        );
      }
      await this.clearLegacyCodes(userId, manager.getRepository(User));
    });
  }

  private async clearLegacyCodes(
    userId: number,
    users: Repository<User>,
  ): Promise<boolean> {
    const result = await users
      .createQueryBuilder()
      .update(User)
      .set({ recoveryCodesEncrypted: null, recoveryCodesIv: null, recoveryCodesTag: null })
      .where('id = :userId', { userId })
      .andWhere('recovery_codes_encrypted IS NOT NULL')
      .execute();
    return (result.affected ?? 0) > 0;
  }

  // ── Audit ────────────────────────────────────────────────────────────

  private async audit(
    actionType: AuditActionType,
    userId: number,
    actor: RecoveryCodeActor,
    context: RecoveryCodeContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLog.log({
        actionType,
        metadata: {
          entityType: 'user',
          entityId: String(userId),
          targetUserId: userId,
          ...metadata,
        },
        context: {
          userId: actor.type === 'system' ? null : actor.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          actor: {
            type: actor.type,
            id: String(actor.id),
            userId: actor.type === 'system' ? null : String(actor.id),
            source: 'two-factor-recovery',
          },
        },
      });
    } catch (error) {
      // Auditing must never block authentication.
      this.logger.error(
        `Failed to write recovery code audit event ${actionType}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
