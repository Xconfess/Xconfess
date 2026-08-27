import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OwnershipGuard } from '../common/guards/ownership.guard';
import { Ownership } from '../common/decorators/ownership.decorator';
import { DataExportService } from '../data-export/data-export.service';

/**
 * Export endpoints.
 * Both JwtAuthGuard (authn) and OwnershipGuard (authz / IDOR) are applied
 * independently at the backend — not delegated to the Next.js proxy.
 */
@Controller('export')
@UseGuards(JwtAuthGuard, OwnershipGuard)
export class ExportController {
  constructor(private readonly exportService: DataExportService) {}

  /**
   * GET /export/jobs/:userId
   * A user can only retrieve their own export jobs.
   */
  @Get('jobs/:userId')
  @Ownership({ paramKey: 'userId', adminBypass: true })
  async getExportJobs(@Param('userId') userId: string, @Req() req: any) {
    // OwnershipGuard already enforced userId === req.user.sub.
    // ExportService receives the verified caller ID — never trust the param alone.
    return this.exportService.getExportHistory(String(req.user.sub));
  }

  /**
   * GET /export/jobs/:userId/:jobId/download
   */
  @Get('jobs/:userId/:jobId/download')
  @Ownership({ paramKey: 'userId', adminBypass: true })
  async downloadExportJob(
    @Param('userId') userId: string,
    @Param('jobId') jobId: string,
    @Req() req: any,
  ) {
    return this.exportService.getExportFile(jobId, String(req.user.sub));
  }
}
