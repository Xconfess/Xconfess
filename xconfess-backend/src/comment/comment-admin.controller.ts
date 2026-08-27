import {
  Controller,
  Post,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CommentService } from './comment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { Request as ExpressRequest } from 'express';
import { ModerationStatus } from './entities/moderation-comment.entity';
import { User } from '../user/entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';

interface RequestWithUser extends ExpressRequest {
  user?: any;
}

/**
 * Admin-only comment moderation controller.
 *
 * Both endpoints require JwtAuthGuard + AdminGuard, applied once at the class
 * level so the guard stack is impossible to accidentally omit on future methods.
 *
 * Routes (all under the global /api prefix):
 *   POST /api/admin/comments/:id/approve
 *   POST /api/admin/comments/:id/reject
 */
@ApiTags('Admin - Comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/comments')
export class CommentAdminController {
  constructor(private readonly service: CommentService, private readonly auditLogService: AuditLogService) {}

  /**
   * Approve a pending comment.
   * Requires: authenticated admin user (JwtAuthGuard + AdminGuard).
   */
  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending comment (admin only)' })
  @ApiParam({ name: 'id', description: 'Comment ID (numeric)', type: Number })
  @ApiResponse({ status: 200, description: 'Comment approved successfully' })
  @ApiResponse({ status: 400, description: 'Comment already moderated' })
  @ApiResponse({ status: 403, description: 'Forbidden – admin role required' })
  @ApiResponse({ status: 404, description: 'Comment or moderation entry not found' })
  async approveComment(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user as User;
    const result = await this.service.moderateComment(+id, ModerationStatus.APPROVED, user);
    this.auditLogService.log({
      actionType: AuditActionType.COMMENT_APPROVED,
      metadata: {
        commentId: id,
        entityType: 'comment',
        entityId: id,
        status: ModerationStatus.APPROVED,
      },
      context: {
        userId: String(user.id),
        actor: {
          type: 'admin',
          id: String(user.id),
          userId: String(user.id),
        },
      },
    }).catch((error) => {
      // Audit logging must not break moderation
    });
    return result;
  }

  /**
   * Reject a pending comment.
   * Requires: authenticated admin user (JwtAuthGuard + AdminGuard).
   */
  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending comment (admin only)' })
  @ApiParam({ name: 'id', description: 'Comment ID (numeric)', type: Number })
  @ApiResponse({ status: 200, description: 'Comment rejected successfully' })
  @ApiResponse({ status: 400, description: 'Comment already moderated' })
  @ApiResponse({ status: 403, description: 'Forbidden – admin role required' })
  @ApiResponse({ status: 404, description: 'Comment or moderation entry not found' })
  async rejectComment(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user as User;
    const result = await this.service.moderateComment(+id, ModerationStatus.REJECTED, user);
    this.auditLogService.log({
      actionType: AuditActionType.COMMENT_REJECTED,
      metadata: {
        commentId: id,
        entityType: 'comment',
        entityId: id,
        status: ModerationStatus.REJECTED,
      },
      context: {
        userId: String(user.id),
        actor: {
          type: 'admin',
          id: String(user.id),
          userId: String(user.id),
        },
      },
    }).catch((error) => {
      // Audit logging must not break moderation
    });
    return result;
  }
}
