import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BookmarkService } from './bookmark.service';
import { BookmarkListQueryDto } from './dto/bookmark-list-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('bookmarks')
@UseGuards(JwtAuthGuard)
export class BookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) {}

  /**
   * POST /bookmarks/:confessionId
   * Toggle bookmark — adds if absent, removes if present.
   */
  @Post(':confessionId')
  @HttpCode(HttpStatus.OK)
  async toggle(
    @GetUser() user: RequestUser,
    @Param('confessionId', ParseUUIDPipe) confessionId: string,
  ) {
    const result = await this.bookmarkService.toggle(user.id, confessionId);
    return {
      success: true,
      ...result,
    };
  }

  /**
   * GET /bookmarks
   * List all bookmarked confessions for the authenticated user, newest first.
   */
  @Get()
  async list(@GetUser() user: RequestUser, @Query() query: BookmarkListQueryDto) {
    const { page = 1, limit = 20 } = query;
    const result = await this.bookmarkService.list(user.id, page, limit);
    return {
      success: true,
      data: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * GET /bookmarks/:confessionId/status
   * Check if a specific confession is bookmarked by the current user.
   */
  @Get(':confessionId/status')
  async status(
    @GetUser() user: RequestUser,
    @Param('confessionId', ParseUUIDPipe) confessionId: string,
  ) {
    const bookmarked = await this.bookmarkService.isBookmarked(user.id, confessionId);
    return { bookmarked };
  }

  /**
   * DELETE /bookmarks/:confessionId
   * Explicitly remove a bookmark. Returns 404 if not bookmarked.
   */
  @Delete(':confessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @GetUser() user: RequestUser,
    @Param('confessionId', ParseUUIDPipe) confessionId: string,
  ) {
    await this.bookmarkService.remove(user.id, confessionId);
  }

  /**
   * GET /bookmarks/count
   * Returns the total number of bookmarks for the authenticated user.
   */
  @Get('count')
  async count(@GetUser() user: RequestUser) {
    const total = await this.bookmarkService.countForUser(user.id);
    return { total };
  }
}
