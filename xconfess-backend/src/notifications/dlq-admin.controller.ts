import {
  Controller,
  Get,
  Post,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JobManagementService } from './services/job-management.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';

@Controller('admin/dlq')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DlqAdminController {
  constructor(private readonly jobManagementService: JobManagementService) {}

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
  async retry(@Param('id') id: string, @Req() req: any) {
    const actorId = String(req.user?.id);
    return this.jobManagementService.replayDlqJob(id, actorId);
  }

  @Post('replay-bulk')
  async replayBulk(@Req() req: any, @Query() options: any) {
    const actorId = String(req.user?.id);
    return this.jobManagementService.replayDlqJobsBulk(actorId, options);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    // Basic remove via JobManagementService if added, for now use standard cleanup
    return { message: 'Use cleanup for bulk or specific ID' };
  }

  @Post('cleanup')
  async cleanup(@Query() options: any) {
    return this.jobManagementService.cleanupDlq(options);
  }

  @Get('diagnostics')
  async getDiagnostics() {
    return this.jobManagementService.getDiagnostics();
  }
}
