import {
  Controller,
  Body,
  Get,
  Post,
  Param,
  Delete,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JobManagementService } from './services/job-management.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AuditLogContext } from '../audit-log/audit-log.service';

@Controller('admin/dlq')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DlqAdminController {
  constructor(private readonly jobManagementService: JobManagementService) {}

  private buildAuditContext(req: any): AuditLogContext {
    const userAgentHeader = req?.headers?.['user-agent'];

    return {
      requestId:
        req?.requestId ||
        req?.id ||
        (typeof req?.headers?.['x-request-id'] === 'string'
          ? req.headers['x-request-id']
          : undefined),
      ipAddress: req?.ip || req?.socket?.remoteAddress,
      userAgent:
        typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
    };
  }

  @Get()
  async list(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('failedAfter') failedAfter?: string,
    @Query('failedBefore') failedBefore?: string,
    @Query('search') search?: string,
  ) {
    return this.jobManagementService.listDlqJobs(page, limit, {
      failedAfter,
      failedBefore,
      search,
    });
  }

  @Post(':id/retry')
  async retry(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @Req() req: any,
  ) {
    const actorId = String(req.user?.id);
    return this.jobManagementService.replayDlqJob(
      id,
      actorId,
      reason,
      this.buildAuditContext(req),
    );
  }

  @Post('replay-bulk')
  async replayBulk(@Req() req: any, @Query() options: any) {
    const actorId = String(req.user?.id);
    return this.jobManagementService.replayDlqJobsBulk(
      actorId,
      options,
      this.buildAuditContext(req),
    );
  }

  @Post('replay')
  async replaySelected(
    @Body() body: { jobIds: string[] },
    @Req() req: any,
  ) {
    const actorId = String(req.user?.id);
    return this.jobManagementService.replayDlqJobsBulk(
      actorId,
      { jobIds: body.jobIds },
      this.buildAuditContext(req),
    );
  }

  @Get('export-csv')
  async exportCsv(
    @Req() req: any,
    @Res() res: Response,
    @Query('failedAfter') failedAfter?: string,
    @Query('failedBefore') failedBefore?: string,
    @Query('search') search?: string,
  ) {
    const csv = await this.jobManagementService.exportDlqCsv({
      failedAfter,
      failedBefore,
      search,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dlq-jobs-${Date.now()}.csv"`,
    );
    res.send(csv);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    // Basic remove via JobManagementService if added, for now use standard cleanup
    return { message: 'Use cleanup for bulk or specific ID' };
  }

  @Post('cleanup')
  async cleanup(@Req() req: any, @Query() options: any) {
    const actorId = String(req.user?.id);
    return this.jobManagementService.cleanupDlq(
      actorId,
      options,
      this.buildAuditContext(req),
    );
  }

  @Get('diagnostics')
  async getDiagnostics() {
    return this.jobManagementService.getDiagnostics();
  }
}