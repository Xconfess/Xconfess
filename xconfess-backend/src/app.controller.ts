import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AdminGuard } from './auth/admin.guard';
import { JobManagementService } from './notifications/services/job-management.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly jobManagementService: JobManagementService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get the welcome message for the API' })
  @ApiResponse({
    status: 200,
    description: 'Returns a greeting message',
    schema: { example: 'Hello, world!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('diagnostics/notifications')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({
    summary: 'Notification delivery metrics and queue health diagnostics',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns queue depth, DLQ depth, counters, and timer metrics for notification processing',
  })
  async getNotificationDiagnostics() {
    return this.jobManagementService.getDiagnostics();
  }
}
