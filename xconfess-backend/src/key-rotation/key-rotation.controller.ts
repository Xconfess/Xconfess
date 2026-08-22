import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { StepUpGuard } from '../auth/guards/step-up.guard';
import { KeyRotationService, RotationOptions } from './key-rotation.service';

@ApiTags('Key Rotation')
@Controller('admin/key-rotation')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class KeyRotationController {
  constructor(private readonly keyRotationService: KeyRotationService) {}

  @Post('rotate')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start confess key rotation',
    description:
      'Rotates the wrapped DEK for all envelope-encrypted confessions to the current master key version. ' +
      'Encrypted content is never touched — only the wrapped DEK and keyVersion are updated.',
  })
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean, description: 'Validate without persisting changes' })
  @ApiQuery({ name: 'batchSize', required: false, type: Number, description: 'Rows per batch (default 500)' })
  @ApiQuery({ name: 'resumeAfterId', required: false, type: String, description: 'Resume rotation after this confession ID' })
  @ApiResponse({ status: 200, description: 'Rotation completed. Check result for success/failure counts.' })
  @ApiResponse({ status: 403, description: 'Admin role + step-up proof required.' })
  async rotate(
    @Query('dryRun') dryRun?: string,
    @Query('batchSize') batchSize?: string,
    @Query('resumeAfterId') resumeAfterId?: string,
  ) {
    const options: RotationOptions = {
      dryRun: dryRun === 'true',
      batchSize: batchSize ? parseInt(batchSize, 10) : 500,
      resumeAfterId: resumeAfterId || undefined,
    };

    const result = await this.keyRotationService.rotateMasterKey(options);

    // Mask error details in response if not dry-run (avoid leaking plaintext info)
    if (result.errors.length > 0) {
      result.errors = result.errors.map((e) => ({
        confessionId: e.confessionId,
        error: 'Decryption/encryption failure — row quarantined',
      }));
    }

    return result;
  }

  @Get('status')
  @ApiOperation({ summary: 'Get key rotation pending count' })
  @ApiResponse({ status: 200, description: 'Number of confessions awaiting rotation.' })
  async getStatus() {
    const pendingCount = await this.keyRotationService.getRotationPendingCount();

    return {
      pendingCount,
      checkedAt: new Date().toISOString(),
    };
  }
}
