import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OwnershipGuard } from '../common/guards/ownership.guard';
import { Ownership } from '../common/decorators/ownership.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto, ReplyMessageDto } from './dto/message.dto';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';
import { RateLimitGuard } from '../auth/guard/rate-limit.guard';
import { RateLimit } from '../auth/guard/rate-limit.decorator';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * POST /messages
   * Send a new message regarding a confession.
   * Rate-limited per sender and sender-confession pair.
   */
  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit(10, 60, 3, 60)
  async createMessage(@Body() dto: CreateMessageDto, @Req() req: any) {
    return this.messagesService.create(dto, req.user);
  }

  /**
   * POST /messages/reply
   * Reply to an existing message.
   * Rate-limited per sender and sender-message pair.
   */
  @Post('reply')
  @UseGuards(RateLimitGuard)
  @RateLimit(10, 60, 3, 60)
  async replyMessage(@Body() dto: ReplyMessageDto, @Req() req: any) {
    return this.messagesService.reply(dto, req.user);
  }

  /**
   * GET /messages/:userId/inbox
   * Users can only read their own inbox.
   */
  @Get(':userId/inbox')
  @UseGuards(OwnershipGuard)
  @Ownership({ paramKey: 'userId' })
  async getInbox(
    @Param('userId') userId: string,
    @Query() query: GetMessagesQueryDto,
    @Req() req: any,
  ) {
    return this.messagesService.getInbox(req.user.sub, query);
  }

  /**
   * GET /messages/thread/:threadId
   * Verify the requester is a participant in the thread — not just authenticated.
   * Supports cursor-based pagination via `cursor`/`limit` query params so large
   * threads never return an unbounded history in a single response.
   */
  @Get('thread/:threadId')
  async getThread(
    @Param('threadId') threadId: string,
    @Query() query: GetMessagesQueryDto,
    @Req() req: any,
  ) {
    const thread = await this.messagesService.getThreadWithParticipantCheck(
      threadId,
      req.user.sub,
      query,
    );
    return thread;
  }

  /**
   * PUT /messages/:userId/thread/:threadId/read
   * Mark messages as read for the sender (recipient of replies).
   * Idempotent: repeated calls have no additional effect.
   * Only the sender (recipient) can mark their messages as read.
   * Returns NotFound to avoid revealing thread existence to non-participants.
   */
  @Put(':userId/thread/:threadId/read')
  @UseGuards(OwnershipGuard)
  @Ownership({ paramKey: 'userId' })
  async markThreadAsRead(
    @Param('userId') userId: string,
    @Param('threadId') threadId: string,
    @Req() req: any,
  ) {
    const [confessionId, senderId] = threadId.split('_');
    if (!confessionId || !senderId) {
      return { success: false, updatedCount: 0 };
    }
    return this.messagesService.markMessagesAsRead(
      confessionId,
      senderId,
      req.user.sub,
    );
  }

  /**
   * DELETE /messages/:userId/thread/:threadId
   * Only the owner can delete from their view.
   */
  @Delete(':userId/thread/:threadId')
  @UseGuards(OwnershipGuard)
  @Ownership({ paramKey: 'userId' })
  async deleteThread(
    @Param('userId') userId: string,
    @Param('threadId') threadId: string,
    @Req() req: any,
  ) {
    return this.messagesService.deleteForUser(req.user.sub, threadId);
  }
}