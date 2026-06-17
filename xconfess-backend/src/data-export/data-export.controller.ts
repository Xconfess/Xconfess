import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UnauthorizedException,
  BadRequestException,
  GoneException,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import { DataExportService } from './data-export.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('data-export')
export class DataExportController {
  constructor(
    private readonly exportService: DataExportService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('request')
  async requestExport(@Req() req: any) {
    return this.exportService.requestExport(String(req.user.id));
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async history(@Req() req: any) {
    const userId = String(req.user.id);
    const latest = await this.exportService.getLatestExport(userId);
    const history = await this.exportService.getExportHistory(userId);

    return {
      latest,
      history,
    };
  }

  /**
   * GET /data-export/:id/status
   *
   * Returns the full lifecycle timeline for a single export job:
   * status, all timestamps, retry count, and last failure reason.
   * Older clients that only need `status` can safely ignore the added fields.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id/status')
  async getJobStatus(@Param('id') id: string, @Req() req: any) {
    return this.exportService.getJobStatus(id, String(req.user.id));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/redownload')
  async redownload(@Param('id') id: string, @Req() req: any) {
    return this.exportService.getRedownloadLink(id, String(req.user.id));
  }

  @Get('download/:id')
  async download(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Query('chunk') chunk: string | undefined,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    // 1. Check Expiration
    const expiresMs = parseInt(expires);
    if (isNaN(expiresMs) || Date.now() > expiresMs) {
      throw new GoneException({
        error: 'Download link has expired.',
        code: 'EXPORT_DOWNLOAD_EXPIRED',
      });
    }

    // 2. Verify Signature
    const secret = this.configService.get<string>('app.appSecret', '');
    const chunkIndex = chunk !== undefined ? parseInt(chunk) : undefined;

    const dataToVerify =
      chunkIndex !== undefined
        ? `${id}:${userId}:${chunkIndex}:${expires}`
        : `${id}:${userId}:${expires}:${token}`;

    const expectedSignature = crypto
      .createHmac('sha256', secret || 'APP_SECRET_NOT_SET')
      .update(dataToVerify)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new UnauthorizedException('Invalid download signature.');
    }

    // 3. Validate one-time token (single-file downloads only)
    if (chunkIndex === undefined) {
      if (!token) {
        throw new UnauthorizedException('Download token missing.');
      }
      const valid = await this.exportService.validateAndConsumeToken(
        id,
        userId,
        token,
      );
      if (!valid) {
        throw new UnauthorizedException(
          'Download link has already been used or is invalid. Request a new link.',
        );
      }
    }

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

    if (!exportReq || (!exportReq.fileData && !exportReq.isChunked)) {
      throw new BadRequestException('File not found or expired.');
    }

    if (exportReq.isChunked) {
      // Return metadata and signed chunk URLs
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
      throw new BadRequestException('File not found or expired.');
    }

    // 5. Stream single file
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="xconfess-data-${userId}.zip"`,
      'Content-Length': exportReq.fileData.length,
    });

    res.send(exportReq.fileData);
  }
}
