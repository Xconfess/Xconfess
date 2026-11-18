import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UnauthorizedException,
  GoneException,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import * as crypto from 'crypto';
import { DataExportService } from './data-export.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Data Export Contributor Guide
 *
 * This controller exposes the GDPR data export API. The guide below
 * documents the request lifecycle, local testing, cleanup expectations,
 * and privacy-safe handling guidance for contributors.
 *
 * ### Request lifecycle
 *
 * 1. Request: `POST /data-export/request` creates an export record
 *    for the authenticated user and enqueues an async job. The API returns
 *    the export request id and initial status.
 * 2. Queue: a background worker consumes the job, gathers the user's
 *    data, builds the artifact(s), and updates the export record with
 *    `completed` or `failed` status. Large exports may be split into
 *    multiple chunks.
 * 3. Poll: `GET /data-export/:id/status` and `GET /data-export/history`
 *    let the client track job progress and retrieve prior exports.
 * 4. Download: the client requests a signed link via
 *    `POST /data-export/:id/redownload`, then calls
 *    `GET /data-export/download/:id` with the signature, expiry, and
 *    one-time token. The controller validates the link and streams the
 *    artifact or returns chunk metadata.
 * 5. Expiry: signed links and tokens expire; expired links return
 *    `410 Gone` with a stable error code.
 *
 * ### Local testing
 *
 * - Start the backend and its dependencies (postgres, redis/queue).
 * - Authenticate as a test user and call `POST /data-export/request`.
 * - Wait for the worker to finish, then check `GET /data-export/:id/status`.
 * - Request a redownload link and download the artifact to verify
 *    contents and checksums.
 * - Use the existing data-export unit tests as a reference for mocking
 *    the queue and storage layers.
 *
 * ### Cleanup expectations
 *
 * - Export artifacts are temporary and must be deleted after their
 *    retention window or once consumed by a one-time download.
 * - The queue worker is responsible for removing partial artifacts and
 *    marking failed jobs so they can be retried or purged.
 * - Expired export records and their chunks must not be served and
 *    should be removed by the cleanup job.
 *
 * ### Privacy-safe handling guidance
 *
 * - Only return data that belongs to the authenticated user.
 * - Never log raw export contents, signed URLs, or one-time tokens; log
 *    only export ids, statuses, and reason codes.
 * - Use timing-safe comparisons for signature verification and treat
 *    failed download attempts as security events.
 * - Ensure artifacts are encrypted at rest and transmitted only over
 *    HTTPS.
 * - Respect data minimization: export only what the user requested and
 *    what is required by the privacy policy.
 */
@ApiTags('Data Export')
@Controller('data-export')
export class DataExportController {
  constructor(
    private readonly exportService: DataExportService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('request')
  @ApiOperation({ summary: 'Request a GDPR data export' })
  @ApiResponse({ status: 201, description: 'Export requested successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async requestExport(@Req() req: any) {
    return this.exportService.requestExport(String(req.user.id));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('history')
  @ApiOperation({ summary: 'Get export request history for current user' })
  @ApiResponse({ status: 200, description: 'Export history.' })
  async history(@Req() req: any) {
    const userId = String(req.user.id);
    const latest = await this.exportService.getLatestExport(userId);
    const history = await this.exportService.getExportHistory(userId);
    return {
      latest,
      history,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/status')
  @ApiOperation({ summary: 'Get job status for a specific export' })
  @ApiParam({ name: 'id', description: 'Export request UUID' })
  @ApiResponse({ status: 200, description: 'Export job status.' })
  async getJobStatus(@Param('id') id: string, @Req() req: any) {
    return this.exportService.getJobStatus(id, String(req.user.id));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/redownload')
  @ApiOperation({ summary: 'Generate a fresh download link for an export' })
  @ApiParam({ name: 'id', description: 'Export request UUID' })
  @ApiResponse({ status: 200, description: 'Redownload link generated.' })
  async redownload(@Param('id') id: string, @Req() req: any) {
    return this.exportService.getRedownloadLink(id, String(req.user.id));
  }

  @Get('download/:id')
  @ApiOperation({ summary: 'Download an export file via signed URL' })
  @ApiParam({ name: 'id', description: 'Export request UUID' })
  @ApiQuery({ name: 'userId', description: 'User ID for verification' })
  @ApiQuery({ name: 'expires', description: 'Expiration timestamp' })
  @ApiQuery({ name: 'signature', description: 'HMAC signature' })
  @ApiQuery({ name: 'chunk', required: false, description: 'Chunk index for multi-part downloads' })
  @ApiQuery({ name: 'token', required: false, description: 'One-time download token' })
  @ApiResponse({ status: 200, description: 'File stream or chunk metadata.' })
  @ApiResponse({ status: 410, description: 'Download link expired.' })
  async download(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Query('chunk') chunk: string | undefined,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    // 1. Check Expiration — 410 Gone for expired links (stable error shape)
    const expiresMs = parseInt(expires);
    if (isNaN(expiresMs) || Date.now() > expiresMs) {
      throw new GoneException({
        statusCode: 410,
        error: 'Gone',
        message: 'Download link has expired.',
        code: 'EXPORT_LINK_EXPIRED',
      });
    }

    // 2. Verify Signature
    const secret = this.configService.get<string>('app.appSecret', '');
    const chunkIndex = chunk !== undefined ? parseInt(chunk) : undefined;

    if (!userId || !signature) {
      if (chunkIndex === undefined) {
        await this.exportService.recordFailedDownloadAttempt(
          id,
          'invalid_signature',
        );
      }
      throw new UnauthorizedException('Invalid download link.');
    }

    if (chunkIndex === undefined && !token) {
      await this.exportService.recordFailedDownloadAttempt(id, 'missing_token');
      throw new UnauthorizedException('Invalid download link.');
    }

    const dataToVerify =
      chunkIndex !== undefined
        ? `${id}:${userId}:${chunkIndex}:${expires}`
        : `${id}:${userId}:${expires}:${token}`;

    const expectedSignature = crypto
      .createHmac('sha256', secret || 'APP_SECRET_NOT_SET')
      .update(dataToVerify)
      .digest('hex');

    if (!this.secureCompare(signature, expectedSignature)) {
      if (chunkIndex === undefined) {
        await this.exportService.recordFailedDownloadAttempt(
          id,
          'invalid_signature',
        );
      }
      throw new UnauthorizedException('Invalid download link.');
    }

    // 3. Validate one-time token (single-file downloads only)
    if (chunkIndex === undefined) {
      const singleFileToken = token as string;
      const valid = await this.exportService.validateAndConsumeToken(
        id,
        userId,
        singleFileToken,
      );
      if (!valid) {
        throw new GoneException({
          statusCode: 410,
          error: 'Gone',
          message: 'Download link has already been used or has expired. Request a new link.',
          code: 'EXPORT_TOKEN_EXPIRED',
        });
      }
    } // ← correctly closes if (chunkIndex === undefined)

    // 4. Fetch from Service
    if (chunkIndex !== undefined) {
      const exportChunk = await this.exportService.getExportChunk(
        id,
        userId,
        chunkIndex,
      );
      if (!exportChunk) throw new NotFoundException('Chunk not found.');

      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="xconfess-data-${userId}-part${chunkIndex + 1}.zip"`,
        'Content-Length': exportChunk.chunkSize,
        'X-Chunk-Checksum': exportChunk.checksum,
      });
      return res.send(exportChunk.fileData);
    }

    const exportReq = await this.exportService.getExportFile(id, userId);

    // Unknown, expired, and other users' exports share the same 404 response so
    // this endpoint never reveals whether an export exists.
    if (!exportReq || (!exportReq.fileData && !exportReq.isChunked)) {
      throw new NotFoundException('Export not found or expired');
    }

    if (exportReq.isChunked) {
      const downloadUrls = await Promise.all(
        Array.from({ length: exportReq.chunkCount }, (_, i) =>
          this.exportService.generateSignedDownloadUrl(id, userId, i),
        ),
      );
      return res.json({
        message: 'This export is multi-part.',
        chunkCount: exportReq.chunkCount,
        totalSize: exportReq.totalSize,
        checksum: exportReq.combinedChecksum,
        downloadUrls,
      });
    }

    if (!exportReq.fileData) {
      throw new NotFoundException('Export not found or expired');
    }

    // 5. Stream single file
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="xconfess-data-${userId}.zip"`,
      'Content-Length': exportReq.fileData.length,
    });

    res.send(exportReq.fileData);
  }

  private secureCompare(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    return (
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }
}
