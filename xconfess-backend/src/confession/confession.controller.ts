import {
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
  Body,
  Get,
  Query,
  Param,
  Put,
  Delete,
  Req,
  Patch,
  UseGuards,
} from '@nestjs/common';
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
import { searchValidationPipe } from '../search-discovery/search-validation.pipe';

type SearchRequest = Request & {
  user?: {
    id?: number;
  };
};

@ApiTags('Confessions')
@Controller('confessions')
export class ConfessionController {
  // For testing compatibility: expose getConfessionById
  getConfessionById(id: string, req: Request) {
    return this.getById(id, req);
  }

  constructor(
    private readonly service: ConfessionService,
    private readonly searchDiscoveryService: SearchDiscoveryService,
  ) {}

  @Post()
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
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateConfessionDto) {
    // Only allow canonical contract
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
  async search(@Query() dto: SearchConfessionDto, @Req() req: SearchRequest) {
    const result = await this.service.search(dto);
    const userId = req.user?.id;
    if (typeof userId === 'number') {
      await this.searchDiscoveryService.recordSearch(userId, dto);
    }
    return result;
  }

  @Get('search/fulltext')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Full-text search confessions' })
  @UsePipes(searchValidationPipe)
  async fullTextSearch(
    @Query() dto: SearchConfessionDto,
    @Req() req: SearchRequest,
  ) {
    const result = await this.service.fullTextSearch(dto);
    const userId = req.user?.id;
    if (typeof userId === 'number') {
      await this.searchDiscoveryService.recordSearch(userId, dto);
    }
    return result;
  }

  @Get('trending/top')
  @ApiOperation({ summary: 'Get trending confessions' })
  getTrending() {
    return this.service.getTrendingConfessions();
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
