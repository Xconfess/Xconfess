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
  HttpStatus,
  Query,
  Param,
  Put,
  Delete,
  Req,
  Patch,
  Res,
  UseGuards,
  UseInterceptors,
  Optional,
} from '@nestjs/common';
import { Response } from 'express';
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
import { SearchConfessionDto } from './dto/search-confession.dto';
import { UpdateConfessionDto } from './dto/update-confession.dto';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { SearchDiscoveryService } from '../search-discovery/search-discovery.service';
import { SparseFieldsetsInterceptor } from '../common/interceptors/sparse-fieldsets.interceptor';
import { ConfessionSchedulerService } from './confession-scheduler.service';
import { ConfessionIdempotencyService } from './confession-idempotency.service';

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
    @Optional()
    private readonly idempotencyService: ConfessionIdempotencyService,
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
    status: 200,
    description: 'Idempotent replay — the confession was already created for this Idempotency-Key.',
  })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @Body() dto: CreateConfessionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (idempotencyKey && this.idempotencyService) {
      const payloadHash = this.idempotencyService.computePayloadHash({
        message: dto.message,
        gender: (dto as any).gender ?? null,
        tags: (dto as any).tags ?? null,
        stellarTxHash: (dto as any).stellarTxHash ?? null,
      });

      const check = await this.idempotencyService.check(idempotencyKey, payloadHash);

      if (check.isReplay && check.cachedResponse) {
        res.status(check.cachedStatus ?? HttpStatus.CREATED);
        return check.cachedResponse;
      }

      if (!check.isReplay) {
        try {
          const confession = await this.service.create(dto);
          await this.idempotencyService.commitSuccess(
            check.record,
            confession as any,
            confession as any,
            HttpStatus.CREATED,
          );
          return confession;
        } catch (err) {
          await this.idempotencyService.commitFailure(check.record);
          throw err;
        }
      }
    }

    return this.service.create(dto);
  }

  @Get()
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
        total: 1,
        page: 1,
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
  getDeleted(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.getDeletedConfessions(page, limit);
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
}
