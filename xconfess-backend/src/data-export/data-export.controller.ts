import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UnauthorizedException,
  BadRequestException,
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
    @Res() res: Response,
    @Query('userId') userId: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Query('chunk') chunk?: string,
  ) {
    // 1. Check Expiration
    if (Date.now() > parseInt(expires)) {
      throw new UnauthorizedException('Download link has expired (24h limit).');
    }

    // 2. Verify Signature
    const secret = this.configService.get<string>('app.appSecret', '');
    const chunkIndex = chunk !== undefined ? parseInt(chunk) : undefined;

    const dataToVerify =
      chunkIndex !== undefined
        ? `${id}:${userId}:${chunkIndex}:${expires}`
        : `${id}:${userId}:${expires}`;

    const expectedSignature = crypto
      .createHmac('sha256', secret || 'APP_SECRET_NOT_SET')
      .update(dataToVerify)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new UnauthorizedException('Invalid download signature.');
    }

    // 3. Fetch from Service (Only if signature is valid)
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
      // Return metadata and links for chunked export
      return res.json({
        message: 'This export is multi-part.',
        chunkCount: exportReq.chunkCount,
        totalSize: exportReq.totalSize,
        checksum: exportReq.combinedChecksum,
        downloadUrls: Array.from({ length: exportReq.chunkCount }, (_, i) =>
          this.exportService.generateSignedDownloadUrl(id, userId, i),
        ),
      });
    }

    // 4. Stream to User (Single file)
    const fileData = exportReq.fileData;
    if (!fileData) {
      throw new BadRequestException('File not found or expired.');
    }

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="xconfess-data-${userId}.zip"`,
      'Content-Length': fileData.length,
    });

    res.send(fileData);
  }
}
