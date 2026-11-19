import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { StepUpGuard } from './guards/step-up.guard';
import { GetUser } from './get-user.decorator';
import {
  RecoveryCodeContext,
  RecoveryCodeService,
  RecoveryCodeStatus,
} from './recovery-code.service';

function requestContext(req: Request | undefined): RecoveryCodeContext {
  const header = req?.headers?.['user-agent'];
  const requestId = req?.headers?.['x-request-id'];
  return {
    ipAddress: req?.ip,
    userAgent: Array.isArray(header) ? header[0] : header,
    requestId: Array.isArray(requestId) ? requestId[0] : requestId,
  };
}

/** Self-service recovery code lifecycle for the signed-in user. */
@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth/2fa/recovery-codes')
@UseGuards(JwtAuthGuard)
export class TwoFactorRecoveryController {
  constructor(private readonly recoveryCodes: RecoveryCodeService) {}

  @Get()
  @ApiOperation({
    summary: 'Recovery code status (counts only — codes are never returned again)',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        enabled: true,
        total: 10,
        remaining: 7,
        generatedAt: '2026-11-19T10:00:00.000Z',
      },
    },
  })
  status(@GetUser('id') userId: number): Promise<RecoveryCodeStatus> {
    return this.recoveryCodes.getStatus(userId);
  }

  @Post('regenerate')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Regenerate recovery codes (invalidates all previous codes)',
    description:
      'Requires a fresh step-up proof in the "x-step-up-token" header. ' +
      'The new codes are returned once and stored only as hashes.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        recoveryCodes: ['7KQ2M-X9D4P', 'H3T8W-0ZC6R'],
        revokedCount: 10,
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Missing or expired step-up proof.' })
  async regenerate(
    @GetUser('id') userId: number,
    @Req() req: Request,
  ): Promise<{ recoveryCodes: string[]; revokedCount: number }> {
    const { codes, revokedCount } = await this.recoveryCodes.generateForUser(
      userId,
      { type: 'user', id: userId },
      'regenerate',
      requestContext(req),
    );
    return { recoveryCodes: codes, revokedCount };
  }
}

/** Administrator revocation, e.g. for a compromised or recovered account. */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminTwoFactorRecoveryController {
  constructor(private readonly recoveryCodes: RecoveryCodeService) {}

  @Post(':id/2fa/recovery-codes/revoke')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Revoke all of a user's two-factor recovery codes (admin only)",
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, schema: { example: { revokedCount: 8 } } })
  @ApiResponse({ status: 403, description: 'Missing or expired step-up proof.' })
  revoke(
    @Param('id', ParseIntPipe) userId: number,
    @GetUser('id') adminId: number,
    @Req() req: Request,
  ): Promise<{ revokedCount: number }> {
    return this.recoveryCodes.revokeAll(
      userId,
      { type: 'admin', id: adminId },
      'admin_revoked',
      requestContext(req),
    );
  }
}
