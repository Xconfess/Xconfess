import {
  Injectable,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  ConfessionIdempotencyRecord,
  IdempotencyStatus,
} from './entities/confession-idempotency-record.entity';
import { AnonymousConfession } from './entities/confession.entity';

/** Max time to wait for a 'processing' lock to complete before timing out. */
const PROCESSING_POLL_INTERVAL_MS = 100;
const PROCESSING_MAX_WAIT_MS = 5_000;

/**
 * Result returned to callers.
 *
 * - `isReplay` true  → caller should return `cachedResponse` immediately
 *                       without re-running confession creation logic.
 * - `isReplay` false → caller should proceed with creation, then call
 *                       `commitSuccess()` or `commitFailure()`.
 * - `record`         → the row that was created/found in the idempotency table.
 */
export interface IdempotencyCheckResult {
  isReplay: boolean;
  cachedResponse: AnonymousConfession | null;
  cachedStatus: number | null;
  record: ConfessionIdempotencyRecord;
}

/**
 * IdempotencyService – confession-scoped idempotency enforcement.
 *
 * Algorithm (atomic, race-safe):
 *
 * 1. Hash the canonicalised request payload → payloadHash.
 * 2. Attempt to INSERT a 'processing' row with a UNIQUE idempotency_key.
 *    - Insert succeeds → caller is first; proceed with creation.
 *    - Insert fails (23505) → a row already exists; handle the three cases:
 *        a. status = 'completed' + same hash   → replay; return cached response.
 *        b. status = 'completed' + diff hash   → 409 Conflict.
 *        c. status = 'processing'              → wait for commit, then replay.
 *        d. status = 'failed'                  → allow retry (same key is valid).
 * 3. After confession is saved, caller calls `commitSuccess()` to persist the
 *    canonical response body and flip status to 'completed'.
 */
@Injectable()
export class ConfessionIdempotencyService {
  constructor(
    @InjectRepository(ConfessionIdempotencyRecord)
    private readonly recordRepo: Repository<ConfessionIdempotencyRecord>,
    private readonly dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Compute the canonical payload hash for a create-confession request.
   * Only idempotency-relevant fields are included.
   */
  computePayloadHash(payload: {
    message: string;
    gender?: string | null;
    tags?: string[] | null;
    stellarTxHash?: string | null;
  }): string {
    const canonical = JSON.stringify({
      message: payload.message,
      gender: payload.gender ?? null,
      tags: payload.tags ? [...payload.tags].sort() : null,
      stellarTxHash: payload.stellarTxHash ?? null,
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Check (and acquire) idempotency for a confession creation request.
   *
   * @param idempotencyKey  The client-supplied idempotency key.
   * @param payloadHash     SHA-256 of the canonicalised payload.
   * @returns               IdempotencyCheckResult – see type for details.
   */
  async check(
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<IdempotencyCheckResult> {
    // Try to insert a 'processing' sentinel row.
    const inserted = await this.tryInsert(idempotencyKey, payloadHash);

    if (inserted) {
      return { isReplay: false, cachedResponse: null, cachedStatus: null, record: inserted };
    }

    // Row already exists – read the current state.
    return this.handleExistingRecord(idempotencyKey, payloadHash);
  }

  /**
   * Mark the idempotency record as successfully completed and persist the
   * canonical response body.
   */
  async commitSuccess(
    record: ConfessionIdempotencyRecord,
    confession: AnonymousConfession,
    responseBody: object,
    responseStatus = HttpStatus.CREATED,
  ): Promise<void> {
    await this.recordRepo.update(record.id, {
      status: 'completed' as IdempotencyStatus,
      confessionId: confession.id,
      responseStatus,
      responseBody,
    });
  }

  /**
   * Mark the idempotency record as failed so that the key can be retried.
   */
  async commitFailure(record: ConfessionIdempotencyRecord): Promise<void> {
    await this.recordRepo.update(record.id, {
      status: 'failed' as IdempotencyStatus,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * INSERT a 'processing' sentinel row.
   * Returns the new row on success, or null if a duplicate key violation occurs.
   */
  private async tryInsert(
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<ConfessionIdempotencyRecord | null> {
    try {
      const row = this.recordRepo.create({
        idempotencyKey,
        payloadHash,
        status: 'processing',
      });
      return await this.recordRepo.save(row);
    } catch (err: any) {
      // 23505 = PostgreSQL unique_violation
      if (err?.code === '23505') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Handle the case where a row for this idempotency key already exists.
   */
  private async handleExistingRecord(
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<IdempotencyCheckResult> {
    const record = await this.recordRepo.findOne({
      where: { idempotencyKey },
    });

    if (!record) {
      // Extremely unlikely race: row was deleted between our insert attempt and
      // this read. Treat as "no record" and let the caller retry.
      throw new HttpException(
        'Idempotency record disappeared unexpectedly. Please retry.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // ── Case: different payload ───────────────────────────────────────────
    if (record.payloadHash !== payloadHash) {
      throw new ConflictException(
        'Idempotency key replay conflict: the request body does not match the original submission.',
      );
    }

    // ── Case: completed – same payload → replay ───────────────────────────
    if (record.status === 'completed' && record.responseBody) {
      const confession =
        record.confessionId
          ? await this.dataSource
              .getRepository(AnonymousConfession)
              .findOne({ where: { id: record.confessionId } })
          : null;

      return {
        isReplay: true,
        cachedResponse: confession,
        cachedStatus: record.responseStatus,
        record,
      };
    }

    // ── Case: failed – allow retry with the same key ──────────────────────
    if (record.status === 'failed') {
      // Reset to 'processing' so the current request can proceed.
      await this.recordRepo.update(record.id, {
        status: 'processing',
        payloadHash,
      });
      return { isReplay: false, cachedResponse: null, cachedStatus: null, record };
    }

    // ── Case: processing – wait for it to complete ────────────────────────
    return this.waitForProcessing(idempotencyKey, payloadHash);
  }

  /**
   * Poll until a 'processing' row transitions to 'completed' or 'failed'.
   * If it doesn't resolve within PROCESSING_MAX_WAIT_MS, allow a retry.
   */
  private async waitForProcessing(
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<IdempotencyCheckResult> {
    const deadline = Date.now() + PROCESSING_MAX_WAIT_MS;

    while (Date.now() < deadline) {
      await sleep(PROCESSING_POLL_INTERVAL_MS);

      const record = await this.recordRepo.findOne({
        where: { idempotencyKey },
      });

      if (!record) {
        // Row was removed; caller may proceed.
        break;
      }

      if (record.payloadHash !== payloadHash) {
        throw new ConflictException(
          'Idempotency key replay conflict: the request body does not match the original submission.',
        );
      }

      if (record.status === 'completed' && record.responseBody) {
        const confession =
          record.confessionId
            ? await this.dataSource
                .getRepository(AnonymousConfession)
                .findOne({ where: { id: record.confessionId } })
            : null;

        return {
          isReplay: true,
          cachedResponse: confession,
          cachedStatus: record.responseStatus,
          record,
        };
      }

      if (record.status === 'failed') {
        // Concurrent request failed; allow this caller to retry.
        await this.recordRepo.update(record.id, {
          status: 'processing',
          payloadHash,
        });
        return { isReplay: false, cachedResponse: null, cachedStatus: null, record };
      }
    }

    // Timed out waiting – treat as a new attempt so the caller can proceed.
    // The stale 'processing' row will be cleaned up by TTL / the failure
    // commit path if the original request ever completes.
    const staleRecord = await this.recordRepo.findOne({
      where: { idempotencyKey },
    });

    // If we couldn't find it, create a fresh one (rare path).
    if (!staleRecord) {
      const row = this.recordRepo.create({ idempotencyKey, payloadHash, status: 'processing' });
      const saved = await this.recordRepo.save(row);
      return { isReplay: false, cachedResponse: null, cachedStatus: null, record: saved };
    }

    // Reset the stale row so this request can take over.
    await this.recordRepo.update(staleRecord.id, {
      status: 'processing',
      payloadHash,
    });

    return { isReplay: false, cachedResponse: null, cachedStatus: null, record: staleRecord };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
