import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { DataCleanupService } from './data-export-cleanup';
import { ExportRequest } from './entities/export-request.entity';
import { ExportChunk } from './entities/export-chunk.entity';
import { ExportProcessor } from './export.processor';
import { User } from '../user/entities/user.entity';
import { EmailModule } from '../email/email.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { EXPORT_QUEUE_NAME } from './data-export.constants';
import { DataExportQueueRegistrar } from './queue-registrar';

/**
 * Data Export Contributor Guide
 * ==============================================================================================================================================================================================================
 *
 * This module wires together the data export pipeline. The guidance below explains the
 * request lifecycle, how to test locally, what cleanup is expected, and how to handle
 * exported data privacy-safely.
 *
 * --- Request lifecycle ---
 * 1. Client calls the controller (DataExportController) to request an export.
 *    The controller authenticates the user and delegates to DataExportService.
 * 2. DataExportService creates an ExportRequest row (possible statuses include pending,
 *    processing, completed, failed, expired) and enqueues a job on the BullMQ export
 *    queue (EXPORT_QUEUE_NAME). The queue is registered here and the producer is wired up
 *    through DataExportQueueRegistrar.
 * 3. When background jobs are enabled (ENABLE_BACKGROUND_JOBS='true'), the ExportProcessor
 *    consumes the job. It reads the user's data in batches, writes ExportChunk rows, and
 *    updates the ExportRequest status as progress advances.
 * 4. Once all chunks are written, the processor marks the request completed and triggers
 *    an email notification via EmailModule. AuditLogModule records the request and any
 *    status transitions.
 * 5. Clients download the generated artifacts through the controller. Artifacts are
 *    composed of the ExportChunk rows associated with the request.
 *
 * --- Local testing ---
 * - Start the dependencies required by this module: a Postgres database for the export
 *   entities and a Redis instance for BullMQ.
 * - Set ENABLE_BACKGROUND_JOBS='true' if you want the ExportProcessor to be registered and
 *   consume jobs. With the flag off, you can still test the controller and queue
 *   producer behavior but jobs will remain queued.
 * - Run the backend test suite and exercise the data export endpoints with an
 *    authenticated user. Verify that ExportRequest and ExportChunk rows are created
 *   and that the queue job completes.
 * - Inspect the BullMQ queue and the database to confirm status transitions and chunk
 *   content.
 *
 * --- Cleanup expectations ---
 * - DataCleanupService is responsible for removing expired export requests and their
 *   associated ExportChunk rows. Exports are time-bound and must not live indefinitely.
 * - Contributors adding export data must ensure the cleanup service is aware of any new
 *   tables or storage locations so that expired artifacts are deleted.
 * - Tests should cover the cleanup path to ensure no orphaned chunks or requests remain.
 *
 * --- Privacy-safe handling ---
 * - Exports contain personal data. Only the requesting user may download their own
 *   artifacts; authorization must be enforced in the controller and service.
 * - Do not log export contents or PII at any point in the pipeline. Log only opaque
 *   identifiers (request id, user id, status) and avoid dumping chunk payloads.
 * - Store generated artifacts in a location that is private by default and accessible
 *   only through authenticated download endpoints.
 * - Ensure cleanup deletes both metadata and generated artifacts so data does not persist
 *   beyond its expiration window.
 */
const jobsEnabled = process.env.ENABLE_BACKGROUND_JOBS === 'true';

@Module({
  imports: [
    BullModule.registerQueue({
      name: EXPORT_QUEUE_NAME,
    }),
    TypeOrmModule.forFeature([ExportRequest, ExportChunk, User]),
    EmailModule,
    AuditLogModule,
  ],
  controllers: [DataExportController],
  providers: [
    DataExportService,
    DataCleanupService,
    ...(jobsEnabled ? [ExportProcessor] : []),
    DataExportQueueRegistrar,
  ],
  exports: [DataExportService, DataCleanupService],
})
export class DataExportModule {}
