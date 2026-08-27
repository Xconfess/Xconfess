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

    if (!exportReq || (!exportReq.fileData && !exportReq.isChunked)) {
      throw new BadRequestException('File not found or expired.');
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

  private secureCompare(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    return (
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }
}
