import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OwnershipGuard } from '../common/guards/ownership.guard';
import { Ownership } from '../common/decorators/ownership.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto, ReplyMessageDto } from './dto/message.dto';
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
  async getInbox(@Param('userId') userId: string, @Req() req: any) {
    return this.messagesService.getInbox(req.user.sub);
  }

  /**
   * GET /messages/thread/:threadId
   * Verify the requester is a participant in the thread — not just authenticated.
   */
  @Get('thread/:threadId')
  async getThread(@Param('threadId') threadId: string, @Req() req: any) {
    const thread = await this.messagesService.getThreadWithParticipantCheck(
      threadId,
      req.user.sub,
    );
    return thread;
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