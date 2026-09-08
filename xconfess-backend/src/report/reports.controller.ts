// xconfess-backend/src/report/reports.controller.ts
import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { RateLimit } from '../auth/guard/rate-limit.decorator';
import { AnonymousUserService } from '../user/anonymous-user.service';

@Controller('confessions')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly anonymousUserService: AnonymousUserService,
  ) {}

  @Post(':id/report')
  @UseGuards(OptionalJwtAuthGuard)
  @RateLimit(5, 300)
  async reportConfession(
    @Param('id') confessionId: string,
    @GetUser('id') reporterId: number | null,
    @Body() dto: CreateReportDto,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Headers('x-anonymous-user-id') anonymousUserId: string | undefined,
    @Headers('x-stellar-wallet') walletAddress: string | undefined,
    @Req() req: Request,
  ) {
    const walletAnonymousUser =
      !anonymousUserId && walletAddress
        ? await this.anonymousUserService.findByWalletAddress(walletAddress)
        : null;
    const resolvedAnonymousUserId = anonymousUserId || walletAnonymousUser?.id;

    // Idempotency keys are only honoured for authenticated users.
    // Anonymous callers use their anonymous user ID for deduplication.
    if (reporterId === null && !resolvedAnonymousUserId) {
      throw new BadRequestException(
        'Connect your wallet before reporting anonymously',
      );
    }

    const idempotencyKey =
      rawIdempotencyKey && reporterId !== null
        ? sanitiseIdempotencyKey(rawIdempotencyKey)
        : undefined;

    return this.reportsService.createReport(
      confessionId,
      reporterId,
      dto,
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        anonymousUserId: reporterId === null ? resolvedAnonymousUserId : undefined,
      },
      idempotencyKey,
    );
  }
}

/**
 * Reject keys that are obviously malformed (empty after trimming, too long).
 * RFC 7231 §3.1 advises treating header values as opaque strings — we only
 * sanitise length to protect the VARCHAR(255) column.
 */
function sanitiseIdempotencyKey(raw: string): string {
  const key = raw.trim();
  if (!key) {
    throw new BadRequestException('Idempotency-Key header must not be blank.');
  }
  if (key.length > 255) {
    throw new BadRequestException(
      'Idempotency-Key must be 255 characters or fewer.',
    );
  }
  return key;
}
