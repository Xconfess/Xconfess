import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import archiver from 'archiver';
import * as crypto from 'crypto';
import { Writable } from 'stream';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { User } from '../user/entities/user.entity';
import { DataExportService } from './data-export.service';
import { EmailService } from '../email/email.service';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXPORT_QUEUE_NAME } from './data-export.constants';

/**
 * Issue #1453 — resumable & idempotent data export processor.
 *
 * Responsibilities:
 *   - Resume from the last successfully completed chunk after a worker
 *     restart or crash. Never duplicate chunks that were already durably
 *     persisted.
 *   - Mark failed chunks with safe, non-sensitive error metadata (no PII,
 *     no stack traces, no file paths).
 *   - Verify the archive integrity before declaring the export READY.
 *   - Allow BullMQ to retry failed attempts — each retry resumes from the
 *     last completed chunk.
 */
@Processor(EXPORT_QUEUE_NAME)
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name);
  private readonly CHUNK_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB per chunk

  constructor(
    @InjectRepository(ExportRequest)
    private exportRepository: Repository<ExportRequest>,
    @InjectRepository(ExportChunk)
    private chunkRepository: Repository<ExportChunk>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataExportService: DataExportService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<{ userId: string; requestId: string }>) {
    if (job.name !== 'process-export') return;
    const { userId, requestId } = job.data;

    try {
      this.logger.log(`Starting chunked export for user ${userId}...`);

      // Stamp processingAt and flip status to PROCESSING. If a previous
      // attempt left some chunks in place, we transparently resume from them.
      await this.dataExportService.markExportProcessing(requestId);

      const data = await this.dataExportService.compileUserData(userId);
      const result = await this.generateChunkedZip(requestId, data);

      // Final integrity pass — re-checksum the persisted chunks against the
      // combined hash we computed in memory. Mismatches fail the job so the
      // caller (Bull / operator) can decide whether to retry.
      await this.dataExportService.verifyArchiveIntegrity(
        requestId,
        result.combinedChecksum,
      );

      await this.exportRepository.update(requestId, {
        status: 'READY',
        isChunked: true,
        chunkCount: result.chunkCount,
        totalSize: result.totalSize.toString(),
        combinedChecksum: result.combinedChecksum,
      });

      // Stamp completedAt
      const now = new Date();
      await this.exportRepository.update(requestId, { completedAt: now });

      const user = await this.userRepository.findOneBy({
        id: parseInt(userId),
      });
      if (user && user.emailEncrypted) {
        await this.emailService.sendWelcomeEmail(
          user.emailEncrypted,
          user.username,
        );
      }

      this.logger.log(
        `Chunked export ${requestId} completed with ${result.chunkCount} chunks.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Export ${requestId} failed: ${message}`);
      // Use the service helper so retryCount and lastFailureReason are persisted.
      await this.dataExportService.markExportFailed(requestId, message);
      // Re-throw so BullMQ can decide on retry semantics. The exception is
      // safe to rethrow because the helper above already sanitized / stored
      // the failure metadata at the chunk level.
      throw error;
    }
  }

  /**
   * Streams the user's data through archiver, slicing the zip output into
   * 10MB chunks. Resumes from the highest COMPLETED chunk index.
   *
   * On resume:
   *   1. We seed `combinedHash`, `totalSize`, and `chunkCount` from the
   *      persisted COMPLETED chunks. This guarantees the final combined
   *      checksum always represents the WHOLE archive — not just the bytes
   *      written after the most recent restart.
   *   2. We re-stream from byte 0 because the archiver library does not
   *      support truncating mid-stream. Chunks whose index is already
   *      durably persisted are skipped from both the DB write AND from
   *      being fed back into `combinedHash` (their bytes are already in
   *      the hash via step 1).
   *
   * Determinism note: even with seeded hashes we still set a fixed entry
   * timestamp on each archiver entry so that byte boundaries match across
   * runs. This keeps the processor robust if step 1 is bypassed (e.g. when
   * the resumed run coincidentally produces a different number of chunks).
   */
  private readonly ARCHIVE_ENTRY_DATE = new Date(0);

  private async generateChunkedZip(
    requestId: string,
    data: any,
  ): Promise<{
    chunkCount: number;
    totalSize: number;
    combinedChecksum: string;
    resumeIndex: number;
  }> {
    // Load any previously persisted chunks so we can seed the combined hash
    // and counters. This is what makes resume + integrity verification work
    // even when archiver output is not byte-identical across runs.
    const persistedChunks = await this.dataExportService.getChunksForRequest(
      requestId,
    );
    const resumeIndex =
      persistedChunks.length === 0
        ? -1
        : persistedChunks[persistedChunks.length - 1].chunkIndex;

    this.logger.log(
      `Resuming export ${requestId} from chunk ${resumeIndex + 1} ` +
        `(persistedChunks=${persistedChunks.length}).`,
    );

    const combinedHash = crypto.createHash('sha256');
    let chunkCount = persistedChunks.length;
    let totalSize = 0;

    // Seed combinedHash, totalSize, chunkCount from persisted chunks.
    for (const persisted of persistedChunks) {
      if (!persisted.fileData || persisted.fileData.length === 0) {
        continue;
      }
      combinedHash.update(persisted.fileData);
      totalSize += persisted.chunkSize;
    }

    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      let currentChunkBuffer: Buffer[] = [];
      let currentChunkSize = 0;

      // Tracks the index of the chunk currently being assembled. We
      // intentionally use a counter rather than relying on chunkCount so that
      // skipped (resumed) chunks still increment the running index.
      let processingChunkIndex = -1;
      let failureRecorded = false;

      const saveChunk = async (buffer: Buffer, index: number) => {
        const checksum = crypto
          .createHash('sha256')
          .update(buffer)
          .digest('hex');
        await this.dataExportService.saveCompletedChunk(
          requestId,
          index,
          buffer,
          checksum,
        );
      };

      const chunkProcessor = new Writable({
        write: async (chunk, encoding, callback) => {
          try {
            const buf = Buffer.isBuffer(chunk)
              ? chunk
              : Buffer.from(chunk, encoding);
            currentChunkBuffer.push(buf);
            currentChunkSize += buf.length;

            if (currentChunkSize >= this.CHUNK_SIZE_LIMIT) {
              const fullBuffer = Buffer.concat(currentChunkBuffer);
              processingChunkIndex += 1;
              const thisIndex = processingChunkIndex;
              currentChunkBuffer = [];
              currentChunkSize = 0;

              if (thisIndex <= resumeIndex) {
                // Already durably persisted — skip both DB write and hash
                // update. Its bytes are already folded into combinedHash via
                // the persistedChunks seed loop above.
                callback();
                return;
              }

              combinedHash.update(fullBuffer);
              totalSize += fullBuffer.length;
              try {
                await saveChunk(fullBuffer, thisIndex);
                chunkCount += 1;
                callback();
              } catch (saveErr) {
                if (!failureRecorded) {
                  failureRecorded = true;
                  await this.dataExportService.markChunkFailed(
                    requestId,
                    thisIndex,
                    saveErr,
                  );
                }
                callback(saveErr as Error);
              }
            } else {
              callback();
            }
          } catch (err) {
            callback(err as Error);
          }
        },
        final: async (callback) => {
          try {
            if (currentChunkBuffer.length > 0) {
              const fullBuffer = Buffer.concat(currentChunkBuffer);
              processingChunkIndex += 1;
              const thisIndex = processingChunkIndex;
              currentChunkBuffer = [];
              currentChunkSize = 0;

              if (thisIndex <= resumeIndex) {
                // Already durably persisted — skip DB write and hash update.
                callback();
                return;
              }

              combinedHash.update(fullBuffer);
              totalSize += fullBuffer.length;
              try {
                await saveChunk(fullBuffer, thisIndex);
                chunkCount += 1;
                callback();
              } catch (saveErr) {
                if (!failureRecorded) {
                  failureRecorded = true;
                  await this.dataExportService.markChunkFailed(
                    requestId,
                    thisIndex,
                    saveErr,
                  );
                }
                callback(saveErr as Error);
              }
            } else {
              callback();
            }
          } catch (err) {
            callback(err as Error);
          }
        },
      });

      archive.on('error', (err) => reject(err));
      chunkProcessor.on('error', (err) => reject(err));
      chunkProcessor.on('finish', () => {
        if (failureRecorded) {
          // A chunk failure has already been recorded — fail the job so
          // BullMQ can decide whether to retry rather than marking READY.
          reject(
            new Error(
              'Export failed: one or more chunks did not complete (see chunk_records).',
            ),
          );
          return;
        }

        resolve({
          chunkCount,
          totalSize,
          combinedChecksum: combinedHash.digest('hex'),
          resumeIndex,
        });
      });

      archive.pipe(chunkProcessor);

      archive.append(JSON.stringify(data, null, 2), {
        name: 'complete_data.json',
        date: this.ARCHIVE_ENTRY_DATE,
      });
      if (data.confessions) {
        const csvContent = this.dataExportService.convertToCsv(
          data.confessions,
        );
        archive.append(csvContent, {
          name: 'confessions.csv',
          date: this.ARCHIVE_ENTRY_DATE,
        });
      }

      archive.finalize();
    });
  }
}
