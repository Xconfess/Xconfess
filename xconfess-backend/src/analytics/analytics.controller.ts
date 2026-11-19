// src/analytics/analytics.controller.ts
import {
  Controller,
  Get,
  Post,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRetentionService } from './analytics-retention.service';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { StepUpGuard } from '../auth/guards/step-up.guard';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard) // Protect analytics endpoints
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly retentionService: AnalyticsRetentionService,
  ) {}

  private normalizeDays(days: number = 7): number {
    return [7, 30].includes(days) ? days : 7;
  }

  @Get('trending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get trending confessions' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (7 or 30)',
    example: 7,
  })
  @ApiResponse({
    status: 200,
    description: 'Trending confessions retrieved successfully',
    schema: {
      example: [
        {
          id: 'uuid',
          content: 'Confession preview...',
          reactionCount: 45,
          createdAt: '2025-01-20T10:00:00Z',
          category: 'work',
        },
      ],
    },
  })
  async getTrending(
    @Query('days', new ParseIntPipe({ optional: true })) days: number = 7,
  ) {
    return this.analyticsService.getTrendingConfessions(
      this.normalizeDays(days),
    );
  }

  @Get('reactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get reaction distribution' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (7 or 30)',
    example: 7,
  })
  @ApiResponse({
    status: 200,
    description: 'Reaction distribution retrieved successfully',
    schema: {
      example: {
        total: 150,
        distribution: [
          { type: 'like', count: 80, percentage: '53.33' },
          { type: 'love', count: 45, percentage: '30.00' },
          { type: 'support', count: 25, percentage: '16.67' },
        ],
        period: '7 days',
      },
    },
  })
  async getReactions(
    @Query('days', new ParseIntPipe({ optional: true })) days: number = 7,
  ) {
    return this.analyticsService.getReactionDistribution(
      this.normalizeDays(days),
    );
  }

  @Get('reactions/comparison')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get reaction distribution with prior-window comparison',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (7 or 30)',
    example: 7,
  })
  async getReactionComparison(
    @Query('days', new ParseIntPipe({ optional: true })) days: number = 7,
  ) {
    return this.analyticsService.getReactionDistributionComparison(
      this.normalizeDays(days),
    );
  }

  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get daily active users' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (7 or 30)',
    example: 7,
  })
  @ApiResponse({
    status: 200,
    description: 'User activity retrieved successfully',
    schema: {
      example: {
        period: '7 days',
        dailyActivity: [
          { date: '2025-01-18', activeUsers: 25 },
          { date: '2025-01-19', activeUsers: 30 },
        ],
        averageDAU: 27.5,
      },
    },
  })
  async getUsers(
    @Query('days', new ParseIntPipe({ optional: true })) days: number = 7,
  ) {
    return this.analyticsService.getDailyActiveUsers(this.normalizeDays(days));
  }

  @Get('users/comparison')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get daily active users with prior-window comparison',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (7 or 30)',
    example: 7,
  })
  async getUserComparison(
    @Query('days', new ParseIntPipe({ optional: true })) days: number = 7,
  ) {
    return this.analyticsService.getUserActivityComparison(
      this.normalizeDays(days),
    );
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get overall platform statistics' })
  @ApiResponse({
    status: 200,
    description: 'Platform stats retrieved successfully',
    schema: {
      example: {
        totalUsers: 1500,
        totalConfessions: 5000,
        totalReactions: 15000,
        publishedConfessions: 4800,
        pendingConfessions: 200,
        averageReactionsPerConfession: '3.12',
        mostPopularCategory: 'work',
        lastUpdated: '2025-01-24T12:00:00Z',
      },
    },
  })
  async getStats() {
    return this.analyticsService.getPlatformStats();
  }

  @Get('growth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get confession growth metrics' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (7 or 30)',
    example: 7,
  })
  @ApiResponse({
    status: 200,
    description: 'Growth metrics retrieved successfully',
    schema: {
      example: {
        period: '7 days',
        totalConfessions: 350,
        averagePerDay: 50.0,
        dailyGrowth: [
          { date: '2025-01-18', count: 45 },
          { date: '2025-01-19', count: 52 },
        ],
        trend: 'increasing',
      },
    },
  })
  async getGrowth(
    @Query('days', new ParseIntPipe({ optional: true })) days: number = 7,
  ) {
    return this.analyticsService.getConfessionGrowth(this.normalizeDays(days));
  }

  @Get('growth/comparison')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get confession growth with prior-window comparison',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (7 or 30)',
    example: 7,
  })
  async getGrowthComparison(
    @Query('days', new ParseIntPipe({ optional: true })) days: number = 7,
  ) {
    return this.analyticsService.getConfessionGrowthComparison(
      this.normalizeDays(days),
    );
  }

  @Get('admin/retention-status')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get analytics retention status',
    description: 'Shows current event count and how many events are eligible for cleanup.',
  })
  @ApiResponse({ status: 200, description: 'Retention status retrieved.' })
  @ApiResponse({ status: 403, description: 'Admin role required.' })
  async getRetentionStatus() {
    return this.retentionService.getRetentionStatus();
  }

  @Get('admin/retention-verify')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify rollup coverage before cleanup',
    description: 'Ensures daily rollups exist for events about to be deleted.',
  })
  @ApiQuery({ name: 'retentionDays', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Verification complete.' })
  @ApiResponse({ status: 403, description: 'Admin role required.' })
  async verifyRollupCoverage(
    @Query('retentionDays', new ParseIntPipe({ optional: true })) retentionDays?: number,
  ) {
    return this.retentionService.verifyRollupCoverage(retentionDays);
  }

  @Post('admin/retention-cleanup')
  @UseGuards(AdminGuard, StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clean up expired analytics events',
    description:
      'Deletes raw analytics events older than the retention period in configurable batches. ' +
      'Preserves daily rollups and aggregates. Idempotent and resumable.',
  })
  @ApiQuery({ name: 'retentionDays', required: false, type: Number, description: 'Retention period in days' })
  @ApiQuery({ name: 'batchSize', required: false, type: Number, description: 'Events to delete per batch' })
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean, description: 'Preview without deleting' })
  @ApiQuery({ name: 'resumeAfterId', required: false, type: String, description: 'Resume from cursor' })
  @ApiResponse({ status: 200, description: 'Cleanup completed or dry-run preview generated.' })
  @ApiResponse({ status: 403, description: 'Admin role + step-up proof required.' })
  async cleanupExpiredEvents(
    @Query('retentionDays', new ParseIntPipe({ optional: true })) retentionDays?: number,
    @Query('batchSize', new ParseIntPipe({ optional: true })) batchSize?: number,
    @Query('dryRun') dryRun?: string,
    @Query('resumeAfterId') resumeAfterId?: string,
  ) {
    return this.retentionService.cleanupOldEvents({
      retentionDays,
      batchSize,
      dryRun: dryRun === 'true',
      resumeAfterId: resumeAfterId || undefined,
    });
  }
}
