import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import {
  CreateFeatureFlagDto,
  UpdateFeatureFlagDto,
} from './dto/create-feature-flag.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { GetUser } from '../auth/get-user.decorator';

@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    return this.featureFlagsService.findAll();
  }

  @Get('check/:name')
  @UseGuards(JwtAuthGuard)
  async checkFlag(
    @Param('name') name: string,
    @GetUser('id') userId: string,
    @Query('override') override?: string,
  ) {
    // URL override for testing
    if (override === 'true') {
      return { enabled: true, override: true };
    }
    if (override === 'false') {
      return { enabled: false, override: true };
    }

    const enabled = await this.featureFlagsService.isEnabled(name, userId);
    return { enabled, override: false };
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Body() dto: CreateFeatureFlagDto, @GetUser() user: any) {
    const actorId = user?.username || user?.email || String(user?.id || '');
    return this.featureFlagsService.create(dto, actorId);
  }

  @Put(':name')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(
    @Param('name') name: string,
    @Body() dto: UpdateFeatureFlagDto,
    @GetUser() user: any,
  ) {
    const actorId = user?.username || user?.email || String(user?.id || '');
    return this.featureFlagsService.update(name, dto, actorId);
  }

  @Post(':name/rollback')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async rollback(@Param('name') name: string, @GetUser() user: any) {
    const actorId = user?.username || user?.email || String(user?.id || '');
    return this.featureFlagsService.rollback(name, actorId);
  }

  @Delete(':name')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async delete(@Param('name') name: string, @GetUser() user: any) {
    const actorId = user?.username || user?.email || String(user?.id || '');
    await this.featureFlagsService.delete(name, actorId);
    return { message: 'Feature flag deleted' };
  }
}
