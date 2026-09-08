import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { StepUpGuard } from '../auth/guards/step-up.guard';
import { AdminService } from './services/admin.service';
import { ModerationService } from './services/moderation.service';
import { ModerationTemplateService } from '../comment/moderation-template.service';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { BulkResolveDto } from './dto/bulk-resolve.dto';
import { ReportStatus, ReportType } from './entities/report.entity';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TemplateCategory } from '../comment/entities/moderation-note-template.entity';
import { UserRole } from '../user/entities/user.entity';
import { Request } from 'express';
import { GetUser } from '../auth/get-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { StellarDiagnosticsService } from './services/stellar-diagnostics.service';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MinLength(1, { message: 'Name must not be empty' })
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  name: string;

  @IsNotEmpty({ message: 'Content is required' })
  @IsString({ message: 'Content must be a string' })
  @MinLength(1, { message: 'Content must not be empty' })
  content: string;

  @IsNotEmpty({ message: 'Category is required' })
  @IsEnum(TemplateCategory, {
    message: 'Category must be a valid template category',
  })
  category: TemplateCategory;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @MinLength(1, { message: 'Name must not be empty' })
  @MaxLength(100, { message: 'Name must be at most 100 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Content must be a string' })
  @MinLength(1, { message: 'Content must not be empty' })
  content?: string;

  @IsOptional()
  @IsEnum(TemplateCategory, {
    message: 'Category must be a valid template category',
  })
  category?: TemplateCategory;

  @IsOptional()
  isActive?: boolean;
}

export class ExportAuditDto {
  @IsNotEmpty()
  @IsString()
  label: string;

  @IsOptional()
  rowCount?: number;

  @IsOptional()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  requestId?: string;
}

type AuthedRequest = Request & { user?: RequestUser };

const auditActionTypeValues = new Set<string>(
  Object.values(AuditActionType) as string[],
);

function parseAuditAction(value?: string): AuditActionType | undefined {
  if (!value) {
    return undefined;
  }

  return auditActionTypeValues.has(value)
    ? (value as AuditActionType)
    : undefined;
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly moderationService: ModerationService,
    private readonly moderationTemplateService: ModerationTemplateService,
    private readonly auditLogService: AuditLogService,
    private readonly stellarDiagnosticsService: StellarDiagnosticsService,
  ) {}

  // Reports
  @Get('reports')
  @ApiOperation({ summary: 'List reports with optional filters and cursor pagination' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ReportStatus,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ReportType,
    description: 'Filter by report type',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    example: '2026-04-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    example: '2026-04-30',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Opaque cursor for cursor-based pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated report list.',
    schema: {
      example: {
        data: [
          {
            id: 'abc-123',
            confessionId: 'def-456',
            status: 'pending',
            type: 'spam',
          },
        ],
        nextCursor: 'eyJpZCI6MTIzLCJjcmVhdGVkQXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwWiJ9',
        hasMore: false,
        limit: 20,
      },
    },
  })
  async getReports(
    @Query('status') status?: ReportStatus,
    @Query('type') type?: ReportType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.adminService.getReportsCursor(
      status,
      type,
      start,
      end,
      parseInt(limit || '20', 10),
      cursor,
    );
  }

  @Get('reports/stats')
  @ApiOperation({ summary: 'Get report queue health stats' })
  @ApiResponse({
    status: 200,
    description: 'Report queue metrics.',
    schema: {
      example: {
        pendingCount: 5,
        oldestUnresolvedAge: 86400,
        resolvedTodayCount: 3,
      },
    },
  })
  async getReportStats() {
    return this.adminService.getReportStats();
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get a single report by ID' })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  @ApiResponse({ status: 200, description: 'Report record.' })
  @ApiResponse({ status: 404, description: 'Report not found.' })
  async getReportById(@Param('id') id: string) {
    return this.adminService.getReportById(id);
  }

  @Patch('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a report (admin action)' })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  @ApiBody({
    schema: {
      example: {
        resolutionNotes: 'Content removed — violates community guidelines.',
        templateId: 3,
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Report resolved successfully.' })
  async resolveReport(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.resolveReport(
      id,
      adminId,
      dto.resolutionNotes || null,
      dto.templateId,
      req,
    );
  }

  @Patch('reports/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a report without taking action' })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  @ApiResponse({ status: 200, description: 'Report dismissed.' })
  async dismissReport(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.dismissReport(
      id,
      adminId,
      dto.resolutionNotes || null,
      req,
    );
  }

  @Patch('reports/bulk-resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk-resolve multiple reports at once' })
  @ApiBody({
    schema: {
      example: {
        reportIds: ['abc-123', 'def-456'],
        notes: 'Batch resolution — content removed.',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'All listed reports resolved.',
    schema: { example: { resolved: 2, failed: 0 } },
  })
  async bulkResolveReports(
    @Body() dto: BulkResolveDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.bulkResolveReports(
      dto.reportIds,
      adminId,
      dto.notes || null,
      req,
    );
  }
  // Confessions
  @Delete('confessions/:id')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @ApiOperation({ summary: 'Delete a confession (admin action)' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiBody({ schema: { example: { reason: 'Violates community standards.' } } })
  @ApiResponse({
    status: 200,
    description: 'Confession deleted.',
    schema: { example: { message: 'Confession deleted successfully' } },
  })
  @ApiResponse({
    status: 403,
    description: 'Missing or expired step-up proof.',
  })
  async deleteConfession(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    await this.adminService.deleteConfession(
      id,
      adminId,
      body.reason || null,
      req,
    );
    return { message: 'Confession deleted successfully' };
  }

  @Patch('confessions/:id/hide')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @ApiOperation({ summary: 'Hide a confession from public view (admin only)' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({ status: 200, description: 'Confession hidden.' })
  @ApiResponse({
    status: 403,
    description: 'Missing or expired step-up proof.',
  })
  async hideConfession(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.hideConfession(
      id,
      adminId,
      body.reason || null,
      req,
    );
  }

  @Patch('confessions/:id/unhide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unhide a confession (admin only)' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({ status: 200, description: 'Confession unhidden.' })
  async unhideConfession(
    @Param('id') id: string,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.unhideConfession(id, adminId, req);
  }

  // Users
  @Get('users/search')
  @ApiOperation({ summary: 'Search users by username with cursor pagination' })
  @ApiQuery({ name: 'q', description: 'Search query', example: 'alice' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Opaque cursor for cursor-based pagination' })
  @ApiResponse({
    status: 200,
    description: 'Matching users with cursor pagination.',
    schema: {
      example: {
        data: [{ id: 1, username: 'alice_42', role: 'user' }],
        nextCursor: null,
        hasMore: false,
        limit: 20,
      },
    },
  })
  async searchUsers(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!query) {
      return { data: [], nextCursor: null, hasMore: false, limit: 20 };
    }
    return this.adminService.searchUsersCursor(
      query,
      parseInt(limit || '20', 10),
      cursor,
    );
  }

  @Get('users/:id/history')
  async getUserHistory(@Param('id') id: string) {
    return this.adminService.getUserHistory(parseInt(id, 10));
  }

  @Post('users/unlock-account')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @ApiOperation({ summary: 'Unlock a locked account by email' })
  @ApiBody({ schema: { example: { email: 'user@example.com' } } })
  @ApiResponse({ status: 200, description: 'Account unlocked.' })
  async unlockAccount(@Body('email') email: string) {
    await this.adminService.unlockAccount(email);
    return { message: `Account unlocked for ${email}` };
  }

  @Patch('users/:id/role')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @ApiOperation({ summary: 'Change a user role' })
  @ApiParam({ name: 'id', description: 'User numeric ID' })
  @ApiBody({ schema: { example: { role: UserRole.MODERATOR } } })
  @ApiResponse({ status: 200, description: 'User role updated.' })
  @ApiResponse({
    status: 403,
    description: 'Missing or expired step-up proof.',
  })
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.updateUserRole(
      parseInt(id, 10),
      dto.role,
      adminId,
      (dto as any).reason || null,
      req,
    );
  }

  @Patch('users/:id/ban')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @ApiOperation({ summary: 'Ban a user account' })
  @ApiParam({ name: 'id', description: 'User numeric ID' })
  @ApiBody({
    schema: {
      example: { reason: 'Repeated policy violations.', durationDays: 30 },
    },
  })
  @ApiResponse({ status: 200, description: 'User banned.' })
  @ApiResponse({
    status: 403,
    description: 'Missing or expired step-up proof.',
  })
  async banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.banUser(
      parseInt(id, 10),
      adminId,
      dto.reason || null,
      req,
      dto.durationDays ?? null,
    );
  }

  @Patch('users/:id/unban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift a user ban' })
  @ApiParam({ name: 'id', description: 'User numeric ID' })
  @ApiResponse({ status: 200, description: 'User unbanned.' })
  async unbanUser(
    @Param('id') id: string,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.unbanUser(parseInt(id, 10), adminId, req);
  }

  // Moderation note templates
  @Get('templates')
  async getTemplates(@Query('includeInactive') includeInactive?: string) {
    return this.moderationTemplateService.findAll(includeInactive === 'true');
  }

  @Get('templates/:id')
  async getTemplateById(@Param('id') id: string) {
    return this.moderationTemplateService.findById(parseInt(id, 10));
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @GetUser('id') adminId: number,
  ) {
    return this.moderationTemplateService.create(dto, adminId);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.moderationTemplateService.update(parseInt(id, 10), dto);
  }

  @Delete('templates/:id')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(@Param('id') id: string) {
    await this.moderationTemplateService.delete(parseInt(id, 10));
  }

  // Stellar diagnostics (issue #1119)
  @Get('stellar/diagnostics')
  @ApiOperation({
    summary: 'Stellar network and contract diagnostics with Horizon liveness ping',
    description:
      'Returns configured network, contract IDs, and a live Horizon reachability check. ' +
      'Never exposes secrets. Horizon unreachable returns a degraded indicator, not a 500.',
  })
  @ApiResponse({
    status: 200,
    description: 'Stellar diagnostics result',
    schema: {
      example: {
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: 'https://soroban-rpc-testnet.stellar.org',
        contractIds: {
          confessionAnchor: 'CB5XMDHT66EISB4WXM4YGNDHYRMZDX42TOHZEAENIUTSSMRFHJSFRNHB',
          reputationBadges: null,
          tippingSystem: null,
        },
        horizonStatus: 'ok',
        horizonLatencyMs: 142,
        deploymentMetadata: {
          loaded: true,
          generatedAtUtc: '2026-05-21T12:34:56Z',
          isStale: false,
          ageDays: 7,
          loadError: null,
        },
        checkedAt: '2026-06-20T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required.' })
  async getStellarDiagnostics() {
    return this.stellarDiagnosticsService.getDiagnostics();
  }

  // Operator anchor & tip lookup (issue #778)
  @Get('lookup/anchor-tip')
  async lookupAnchorAndTip(
    @Query('txHash') txHash?: string,
    @Query('confessionId') confessionId?: string,
  ) {
    return this.adminService.lookupAnchorAndTip({ txHash, confessionId });
  }
  // Analytics
  @Get('analytics')
  @ApiOperation({ summary: 'Get platform analytics (optionally date-bounded)' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    example: '2026-04-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    example: '2026-04-30',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated platform metrics.',
    schema: {
      example: {
        totalConfessions: 1420,
        totalUsers: 380,
        totalReports: 42,
        totalReactions: 8500,
      },
    },
  })
  async getAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.adminService.getAnalytics(start, end);
  }

  // Audit logs
  @Get('audit-logs')
  @ApiOperation({ summary: 'Query the admin audit log' })
  @ApiQuery({
    name: 'adminId',
    required: false,
    description: 'Filter by admin user ID',
  })
  @ApiQuery({
    name: 'actor',
    required: false,
    description: 'Filter by actor username, label, or ID',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    description: 'Filter by action type',
  })
  @ApiQuery({
    name: 'entityType',
    required: false,
    description: 'Filter by entity type (e.g. confession, user)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Full-text keyword search across audit entries',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'actor', 'action', 'target'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({
    status: 200,
    description: 'Audit log entries matching the filter.',
    schema: {
      example: {
        data: [
          {
            id: 'log-abc-123',
            adminId: 1,
            action: 'DELETE_CONFESSION',
            entityType: 'confession',
            entityId: 'f47ac10b-...',
            createdAt: '2026-04-25T10:00:00.000Z',
          },
        ],
        total: 1,
      },
    },
  })
  async getAuditLogs(
    @Query('adminId') adminId?: string,
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('requestId') requestId?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'actor' | 'action' | 'target',
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.auditLogService.findAll({
      userId: adminId,
      actor,
      actionType: parseAuditAction(action),
      entityType,
      entityId,
      requestId,
      search,
      sortBy,
      sortOrder,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: parseInt(limit || '100', 10),
      offset: parseInt(offset || '0', 10),
    });

    return result;
  }

  @Get('observability')
  @ApiOperation({ summary: 'Get observability metrics for audit and notification health' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    example: '2026-05-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    example: '2026-05-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated observability metrics for admin review.',
  })
  async getObservability(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.auditLogService.getObservabilityMetrics(start, end);
  }
}
