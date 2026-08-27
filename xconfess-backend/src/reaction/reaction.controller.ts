import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ReactionService } from './reaction.service';
import { CreateReactionDto } from './dto/create-reaction.dto';
import { Reaction } from './entities/reaction.entity';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

interface OptionalAuthRequest extends Request {
  user?: RequestUser | null;
}

@ApiTags('Reactions')
@Controller('reactions')
export class ReactionController {
  constructor(private readonly reactionService: ReactionService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Add or update an emoji reaction on a confession' })
  @ApiBody({ type: CreateReactionDto })
  @ApiResponse({ status: 201, description: 'Reaction recorded.' })
  @ApiResponse({ status: 404, description: 'Confession or user not found.' })
  async addReaction(
    @Body() dto: CreateReactionDto,
    @Req() req: OptionalAuthRequest,
  ): Promise<Reaction> {
    return this.reactionService.createReaction(dto, req.user?.id ?? null);
  }
}
