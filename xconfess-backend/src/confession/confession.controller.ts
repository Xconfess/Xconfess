import {
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
  ValidationError,
  BadRequestException,
  Body,
  Get,
  Headers,
  Query,
  Param,
  Put,
  Delete,
  Req,
  Patch,
  UseGuards,
  UseInterceptors,
  Optional,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { AnchorConfessionDto } from '../stellar/dto/anchor-confession.dto';
import { ConfessionService } from './confession.service';
import { CreateConfessionDto } from './dto/create-confession.dto';
import { GetConfessionsByTagDto } from './dto/get-confessions-by-tag.dto';
import { GetConfessionsDto } from './dto/get-confessions.dto';
import { GetDeletedConfessionsDto } from './dto/get-deleted-confessions.dto';
import { SearchConfessionDto } from './dto/search-confession.dto';
import { UpdateConfessionDto } from './dto/update-confession.dto';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { SearchDiscoveryService } from '../search-discovery/search-discovery.service';
import { SparseFieldsetsInterceptor } from '../common/interceptors/sparse-fieldsets.interceptor';
import { QueryTimeoutInterceptor } from '../common/query-timeout.interceptor';
import { DeprecatedApi } from '../common/decorators/deprecated-api.decorator';
import { ConfessionSchedulerService } from './confession-scheduler.service';
import { buildIdempotencyScope } from './idempotency-scope';

const flattenValidationErrors = (
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      fieldErrors[path] = Object.values(error.constraints);
    }

    if (error.children && error.children.length > 0) {
      Object.assign(fieldErrors, flattenValidationErrors(error.children, path));
    }
  }

  return fieldErrors;
};

const searchValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  exceptionFactory: (validationErrors: ValidationError[]) => {
    const fields = flattenValidationErrors(validationErrors);
    return new BadRequestException({
      message: 'Validation failed for search parameters',
      details: { fields },
    });
  },
});

@ApiTags('Confessions')
@Controller('confessions')
@UseInterceptors(SparseFieldsetsInterceptor)
export class ConfessionController {
  // For testing compatibility: expose getConfessionById
  getConfessionById(id: string, req: Request) {
    return this.getById(id, req);
  }

  constructor(
    private readonly service: ConfessionService,
    private readonly searchDiscoveryService: SearchDiscoveryService,
    @Optional()
    private readonly schedulerService: ConfessionSchedulerService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a new anonymous confession' })
  @ApiBody({ type: CreateConfessionDto })
  @ApiResponse({
    status: 201,
    description: 'Confession created successfully.',
    schema: {
      example: {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        message: 'I secretly enjoy watching reality TV shows.',
        gender: 'male',
        tags: ['humor'],
        view_count: 0,
        created_at: '2026-04-25T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error — message exceeds 1000 chars or invalid enum.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Idempotent replay — a repeated Idempotency-Key with the same payload returns the original confession and does not create a duplicate.',
  })
  @ApiResponse({
    status: 409,
    description:
      'Idempotency-Key was already used with a different payload (scoped per session/operation).',
  })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @Body() dto: CreateConfessionDto,
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Headers('x-stellar-wallet') walletAddress: string | undefined,
    @Req() req: Request,
  ) {
    // Accept the key from either the body or the `Idempotency-Key` header
    // (header wins only when the body omits it) and let the service own the
    // whole idempotency lifecycle. Scoping the key to this session/operation
    // is what prevents cross-session collisions (Issue #2116).
    const idempotencyKey = dto.idempotencyKey ?? idempotencyKeyHeader;

    if (idempotencyKey) {
      return this.service.create(
        { ...dto, idempotencyKey },
        undefined,
        walletAddress,
        buildIdempotencyScope(req),
      );
    }

    return walletAddress
      ? this.service.create(dto, undefined, walletAddress)
      : this.service.create(dto);
  }

  @Get()
  @UseInterceptors(QueryTimeoutInterceptor)
  @DeprecatedApi({
    deprecatedAt: '2026-10-21',
    sunsetAt: '2027-04-30',
    successor: '/api/confessions',
    guidance: 'Use cursor pagination (?cursor=...&limit=...) instead of ?page=.',
    legacyQueryParam: 'page',
  })
  @ApiOperation({ summary: 'Get paginated confessions list' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of confessions.',
    schema: {
      example: {
        data: [
          {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            message: 'I secretly enjoy watching reality TV shows.',
            gender: 'male',
            view_count: 12,
            created_at: '2026-04-25T10:00:00.000Z',
          },
        ],
        nextCursor: 'eyJpZCI6ImY0N2FjMTBiIiwib2Zmc2V0IjoyMH0=',
        hasMore: true,
        hasNextPage: true,
        limit: 20,
      },
    },
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  findAll(@Query() dto: GetConfessionsDto) {
    return this.service.getConfessions(dto);
  }

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Search confessions (hybrid)' })
  @UsePipes(searchValidationPipe)
  async search(@Query() dto: SearchConfessionDto, @Req() req: any) {
    const result = await this.service.search(dto);
    if (req.user && req.user.id) {
      await this.searchDiscoveryService.recordSearch(req.user.id, dto);
    }
    return result;
  }

  @Get('search/fulltext')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Full-text search confessions' })
  @UsePipes(searchValidationPipe)
  async fullTextSearch(@Query() dto: SearchConfessionDto, @Req() req: any) {
    const result = await this.service.fullTextSearch(dto);
    if (req.user && req.user.id) {
      await this.searchDiscoveryService.recordSearch(req.user.id, dto);
    }
    return result;
  }

  @Get('trending/top')
  @ApiOperation({ summary: 'Get trending confessions' })
  @ApiQuery({ name: 'window', required: false, enum: ['24h', '7d', '30d', 'all'] })
  getTrending(@Query('window') window?: string) {
    return this.service.getTrendingConfessions(window || '24h');
  }

  @Get('tags')
  @ApiOperation({ summary: 'Get all available tags' })
  getAllTags() {
    return this.service.getAllTags();
  }

  @Get('tags/:tag')
  @ApiOperation({ summary: 'Get confessions filtered by tag' })
  @ApiParam({ name: 'tag', description: 'Tag name to filter by' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  getByTag(@Param('tag') tag: string, @Query() dto: GetConfessionsByTagDto) {
    return this.service.getConfessionsByTag(tag, dto);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'List soft-deleted confessions (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  getDeleted(@Query() dto: GetDeletedConfessionsDto) {
    return this.service.getDeletedConfessions(dto.page, dto.limit);
  }

  /**
   * IMPORTANT:
   * Place nested param routes BEFORE :id
   */
  @Get(':id/stellar/verify')
  @ApiOperation({ summary: 'Verify Stellar anchoring for a confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  verifyStellarAnchor(@Param('id') id: string) {
    return this.service.verifyStellarAnchor(id);
  }

  @Post(':id/anchor')
  @ApiOperation({ summary: 'Anchor a confession on Stellar blockchain' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  anchorConfession(@Param('id') id: string, @Body() dto: AnchorConfessionDto) {
    return this.service.anchorConfession(id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('id') id: string, @Body() dto: UpdateConfessionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted confession (admin)' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Post(':id/schedule')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Schedule a confession for future posting' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  async scheduleConfession(
    @Param('id') id: string,
    @Body('publishAt') publishAt: string,
  ) {
    return this.schedulerService.scheduleConfession(id, new Date(publishAt));
  }

  @Delete(':id/schedule')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Cancel scheduled confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  async cancelSchedule(@Param('id') id: string) {
    return this.schedulerService.cancelSchedule(id);
  }

  @Get('user/scheduled')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get user scheduled confessions' })
  async getScheduled(@Req() req: Request) {
    const userId = req['user']?.id;
    if (!userId) {
      return [];
    }
    return this.schedulerService.getScheduledConfessions(String(userId));
  }

  /**
   * ALWAYS keep generic :id LAST
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a single confession by ID (increments view count)',
  })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({
    status: 200,
    description: 'Confession found.',
    schema: {
      example: {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        message: 'I secretly enjoy watching reality TV shows.',
        gender: 'male',
        view_count: 13,
        tags: ['humor'],
        created_at: '2026-04-25T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Confession not found.' })
  getById(@Param('id') id: string, @Req() req: Request) {
    return this.service.getConfessionByIdWithViewCount(id, req);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete a confession (Issue #1929)',
    description:
      'Marks a confession as deleted. It will be removed from public feeds but kept in audit records.',
  })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({
    status: 200,
    description: 'Confession soft-deleted successfully.',
  })
  @ApiResponse({ status: 404, description: 'Confession not found.' })
  deleteConfession(
    @Param('id') id: string,
    @Headers('x-anonymous-user-id') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('User ID is required for deletion');
    }
    return this.service.deleteConfession(id, userId);
  }

  @Patch(':id/restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted confession (Issue #1929)',
    description: 'Restores a confession that was previously soft-deleted.',
  })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({
    status: 200,
    description: 'Confession restored successfully.',
  })
  @ApiResponse({ status: 404, description: 'Confession not found.' })
  restoreConfession(@Param('id') id: string) {
    return this.service.restoreConfession(id);
  }
}
