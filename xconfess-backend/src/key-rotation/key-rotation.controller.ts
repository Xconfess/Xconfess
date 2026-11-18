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

  @Get('key-version-distribution')
  @ApiOperation({
    summary: 'Analyze key version distribution',
    description: 'Shows how many confessions use each encryption key version. Useful for planning rotation windows.'
  })
  @ApiResponse({ status: 200, description: 'Distribution of confessions across key versions.' })
  async analyzeKeyDistribution() {
    return this.keyRotationService.analyzeKeyVersionDistribution();
  }

  @Post('retire-key')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check if a key version can be retired',
    description: 'Validates that no confessions depend on a key version before allowing retirement. ' +
      'Blocks retirement of the current active key. Returns detailed coverage report.'
  })
  @ApiQuery({ name: 'keyVersion', required: true, type: String, description: 'Key version to check for retirement (e.g., "v1")' })
  @ApiResponse({ status: 200, description: 'Retirement eligibility check complete.' })
  @ApiResponse({ status: 403, description: 'Admin role + step-up proof required.' })
  async checkKeyRetirement(
    @Query('keyVersion') keyVersion: string,
  ) {
    if (!keyVersion) {
      return {
        canRetire: false,
        recordsStillUsing: -1,
        details: 'Missing required query parameter: keyVersion',
        recommendations: ['Provide keyVersion query parameter (e.g., v1, v2)'],
      };
    }

    return this.keyRotationService.checkKeyRetirementCoverage(keyVersion);
  }
}
