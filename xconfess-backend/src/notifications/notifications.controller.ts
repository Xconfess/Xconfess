import {
  Controller,
  Get,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationService } from './services/notification.service';
import {
  UpdateNotificationPreferenceDto,
  NotificationQueryDto,
} from './dto/notification.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(@Request() req, @Query() query: NotificationQueryDto) {
    const userId = req.user.id;
    return this.notificationService.getUserNotifications(userId, query);
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const userId = req.user.id;
    const { unreadCount } = await this.notificationService.getUserNotifications(
      userId,
      { page: 1, limit: 1, unreadOnly: true },
    );
    return { unreadCount };
  }

  @Patch(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    const userId = req.user.id;
    return this.notificationService.markAsRead(id, userId);
  }

  @Patch('read-all')
  async markAllAsRead(@Request() req) {
    const userId = req.user.id;
    await this.notificationService.markAllAsRead(userId);
    return { message: 'All notifications marked as read' };
  }

  @Get('preferences')
  async getPreferences(@Request() req) {
    const userId = req.user.id;
    return this.notificationService.getUserPreference(userId);
  }

  @Put('preferences')
  async updatePreferences(
    @Request() req,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    const userId = req.user.id;
    return this.notificationService.updateUserPreference(userId, dto);
  }
}
