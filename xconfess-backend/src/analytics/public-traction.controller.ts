import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TractionMetricsService } from './traction-metrics.service';

@ApiTags('Public traction')
@Controller('public/traction')
export class PublicTractionController {
  constructor(private readonly tractionMetricsService: TractionMetricsService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({
    summary: 'Get privacy-safe public traction metrics',
    description:
      'Returns aggregate-only product and Stellar metrics. No confession or message content is exposed.',
  })
  @ApiResponse({ status: 200, description: 'Aggregate traction metrics returned' })
  async getTraction() {
    return this.tractionMetricsService.getPublicMetrics();
  }
}
