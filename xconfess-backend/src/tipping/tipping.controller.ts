import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import {
  TippingService,
  TipVerificationResult,
  TipResponseState,
} from './tipping.service';
import { Tip } from './entities/tip.entity';
import { VerifyTipDto } from './dto/verify-tip.dto';

/**
 * Public-safe view of a Tip row. Deliberately excludes internal fields that
 * must never reach the client: `idempotencyKey`, `processingLock`,
 * `lockedAt`, `lockedBy`, `retryCount`, `lastChainStatus`, `lastCheckedAt`,
 * and `reconciliationMetadata` (which can carry raw upstream error text).
 * Issue #1687.
 */
export interface SafeTipView {
  id: string;
  confessionId: string;
  amount: number;
  txId: string;
  senderAddress: string | null;
  status: string;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface TipVerifyResponse {
  state: TipResponseState;
  success: true;
  isNew: boolean;
  isIdempotent: boolean;
  tip: SafeTipView;
}

function toSafeTipView(tip: Tip): SafeTipView {
  return {
    id: tip.id,
    confessionId: tip.confessionId,
    amount: tip.amount,
    txId: tip.txId,
    senderAddress: tip.senderAddress,
    status: tip.verificationStatus,
    verifiedAt: tip.verifiedAt,
    createdAt: tip.createdAt,
  };
}

@ApiTags('Tipping')
@Controller('confessions/:id/tips')
export class TippingController {
  constructor(private readonly tippingService: TippingService) {}

  @Get()
  @ApiOperation({ summary: 'List all tips for a confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({
    status: 200,
    description: 'Tips for the confession.',
    schema: {
      example: [
        {
          id: 'tip-abc-123',
          confessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          amount: 100,
          txHash: 'a3f8e2d1b4c5a6e7f8d9c0b1a2e3f4d5c6b7a8e9f0d1c2b3a4e5f6d7c8b9a0e1',
          status: 'completed',
          createdAt: '2026-04-25T10:00:00.000Z',
        },
      ],
    },
  })
  getTips(@Param('id') confessionId: string) {
    return this.tippingService.getTipsByConfessionId(confessionId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregate tip stats for a confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({
    status: 200,
    description: 'Tip statistics.',
    schema: {
      example: {
        totalAmount: 550,
        tipCount: 3,
        latestTip: '2026-04-25T10:00:00.000Z',
      },
    },
  })
  getTipStats(@Param('id') confessionId: string) {
    return this.tippingService.getTipStats(confessionId);
  }

  @Post('verify')
  @Throttle({ strict: {} })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({
    summary: 'Verify and record a Stellar XLM tip transaction',
    description:
      'Rate limited separately from the global default — this route ' +
      'hits Stellar Horizon to verify the transaction and is throttled ' +
      'per IP+confession to protect against RPC cost spikes. See API ' +
      'docs / runbook for limits.',
  })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiBody({
    type: VerifyTipDto,
    description: 'Stellar transaction ID to verify.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Tip verified and recorded. `state` is `"verified"` for a first-time ' +
      'settlement or `"duplicate"` for a safe, canonical replay of an ' +
      'already-verified transaction — both are success outcomes.',
    schema: {
      example: {
        state: 'verified',
        success: true,
        isNew: true,
        isIdempotent: false,
        tip: {
          id: 'tip-abc-123',
          confessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          amount: 100,
          txId: 'a3f8e2d1b4c5a6e7f8d9c0b1a2e3f4d5c6b7a8e9f0d1c2b3a4e5f6d7c8b9a0e1',
          senderAddress: null,
          status: 'verified',
          verifiedAt: '2026-04-25T10:00:00.000Z',
          createdAt: '2026-04-25T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Malformed transaction ID (fails validation), tip amount out of ' +
      'bounds, or `state: "failed"` for a transaction that could not be ' +
      'verified on-chain.',
  })
  @ApiResponse({
    status: 404,
    description: 'Confession not found, or transaction not found on the Stellar network.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Typed conflict outcome. `state` distinguishes the case: ' +
      '`"conflict"` (tx already bound to a different confession), ' +
      '`"pending"` (another request is settling this tx right now — retry), ' +
      'or `"stale"` (verification exceeded the SLA and is under review — retry).',
  })
  @ApiResponse({ status: 429, description: 'Too many verification requests for this confession. Retry after the window in the `Retry-After-strict` header.' })
  async verifyTip(
    @Param('id') confessionId: string,
    @Body() dto: VerifyTipDto,
    @Req() req: Request,
    @Headers('idempotency-key') _idempotencyKey?: string,
  ): Promise<TipVerifyResponse> {
    const requestId = (req as any).requestId as string | undefined;
    // The tipping service derives its own idempotency key from confessionId + txId
    // (DB-level UNIQUE constraint). The optional Idempotency-Key header is accepted
    // here for API consistency but does not alter the de-duplication logic — the
    // txId uniqueness guarantee already makes retries safe.
    const result: TipVerificationResult =
      await this.tippingService.verifyAndRecordTip(confessionId, dto, requestId);

    return {
      state: result.state,
      success: true,
      isNew: result.isNew,
      isIdempotent: result.isIdempotent,
      tip: toSafeTipView(result.tip),
    };
  }
}