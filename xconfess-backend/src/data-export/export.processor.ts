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
import { buildExportManifest } from './export-manifest';

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

      // markExportProcessing is idempotent: if this job is already PROCESSING
      // (e.g. a worker restart delivered the same job twice) it returns early
      // so we never reset timestamps or re-enter a running job (Issue #2156).
      await this.dataExportService.markExportProcessing(requestId);

      // Discard any partial chunks from a previous failed attempt before
      // writing new ones so retried jobs always start from a clean slate (Issue #2156).
      await this.dataExportService.cleanupPartialChunks(requestId);

      const data = await this.dataExportService.compileUserData(userId);
      const result = await this.generateChunkedZip(requestId, data);

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
      // Clean up any partial chunks written before the failure so the next
      // retry starts fresh (Issue #2156).
      try {
        await this.dataExportService.cleanupPartialChunks(requestId);
      } catch (cleanupErr) {
        const cleanupMsg =
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        this.logger.warn(
          `Failed to clean partial chunks for export ${requestId}: ${cleanupMsg}`,
        );
      }
      // Use the service helper so retryCount and lastFailureReason are persisted
      await this.dataExportService.markExportFailed(requestId, message);
    }
  }

  private async generateChunkedZip(
    requestId: string,
    data: any,
  ): Promise<{
    chunkCount: number;
    totalSize: number;
    combinedChecksum: string;
  }> {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const combinedHash = crypto.createHash('sha256');
      let chunkCount = 0;
      let totalSize = 0;
      let currentChunkBuffer: Buffer[] = [];
      let currentChunkSize = 0;

      const saveChunk = async (buffer: Buffer, index: number) => {
        const checksum = crypto
          .createHash('sha256')
          .update(buffer)
          .digest('hex');
        await this.chunkRepository.save({
          exportRequestId: requestId,
          chunkIndex: index,
          fileData: buffer,
          chunkSize: buffer.length,
          checksum,
        });
      };

      const chunkProcessor = new Writable({
        write: async (chunk, encoding, callback) => {
          try {
            const buf = Buffer.isBuffer(chunk)
              ? chunk
              : Buffer.from(chunk, encoding);
            combinedHash.update(buf);
            totalSize += buf.length;

            currentChunkBuffer.push(buf);
            currentChunkSize += buf.length;

            if (currentChunkSize >= this.CHUNK_SIZE_LIMIT) {
              const fullBuffer = Buffer.concat(currentChunkBuffer);
              await saveChunk(fullBuffer, chunkCount++);
              currentChunkBuffer = [];
              currentChunkSize = 0;
            }
            callback();
          } catch (err) {
            callback(err as Error);
          }
        },
        final: async (callback) => {
          try {
            if (currentChunkBuffer.length > 0) {
              const fullBuffer = Buffer.concat(currentChunkBuffer);
              await saveChunk(fullBuffer, chunkCount++);
            }
            callback();
          } catch (err) {
            callback(err as Error);
          }
        },
      });

      archive.on('error', (err) => reject(err));
      chunkProcessor.on('error', (err) => reject(err));
      chunkProcessor.on('finish', () => {
        resolve({
          chunkCount,
          totalSize,
          combinedChecksum: combinedHash.digest('hex'),
        });
      });

      archive.pipe(chunkProcessor);

      const files = ['complete_data.json'];
      archive.append(JSON.stringify(data, null, 2), {
        name: 'complete_data.json',
      });
      if (data.confessions) {
        const csvContent = this.dataExportService.convertToCsv(
          data.confessions,
        );
        archive.append(csvContent, { name: 'confessions.csv' });
        files.push('confessions.csv');
      }
      archive.append(
        JSON.stringify(buildExportManifest(data, files), null, 2),
        { name: 'manifest.json' },
      );

      archive.finalize();
    });
  }
}
