import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import {
  CreateMessageDto,
  GetMessagesQueryDto,
  ReplyMessageDto,
} from './dto/message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../user/entities/user.entity';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Send an anonymous message to a confession author' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @ApiResponse({ status: 404, description: 'Confession not found' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async sendMessage(@Body() dto: CreateMessageDto, @GetUser() user: User) {
    const message = await this.messagesService.create(dto, user);
    // Confessions are anonymous; no email notification is sent here.
    return { success: true, messageId: message.id };
  }

  @UseGuards(JwtAuthGuard)
  @Post('reply')
  @ApiOperation({
    summary: 'Reply to an anonymous message (author only, single reply)',
  })
  @ApiResponse({ status: 200, description: 'Reply sent successfully' })
  @ApiResponse({
    status: 403,
    description: 'Not the author or already replied',
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async replyMessage(@Body() dto: ReplyMessageDto, @GetUser() user: User) {
    await this.messagesService.reply(dto, user);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('threads')
  @ApiOperation({
    summary: 'Get all message threads for the authenticated user',
  })
  async getThreads(@GetUser() user: User) {
    return this.messagesService.findAllThreadsForUser(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get messages for a specific confession thread' })
  @ApiQuery({
    name: 'confession_id',
    required: true,
    description: 'Confession UUID',
  })
  @ApiQuery({
    name: 'sender_id',
    required: true,
    description: 'Sender anonymous user ID',
  })
  @ApiResponse({ status: 200, description: 'Messages returned successfully' })
  @ApiResponse({ status: 403, description: 'Not part of this conversation' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async getMessages(
    @Query() query: GetMessagesQueryDto,
    @GetUser() user: User,
  ) {
    const messages = await this.messagesService.findForConfessionThread(
      query.confession_id,
      query.sender_id,
      user,
    );
    // Hide sender info for anonymity
    return {
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
        hasReply: m.hasReply,
        replyContent: m.replyContent,
        repliedAt: m.repliedAt,
      })),
      total: messages.length,
    };
  }
}
