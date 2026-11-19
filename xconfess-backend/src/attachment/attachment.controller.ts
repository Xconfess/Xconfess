import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { AttachmentCleanupService } from './attachment-cleanup.service';
import { AttachmentIntegrityService } from './attachment-integrity.service';
import { AttachmentRepository } from './repository/attachment.repository';
import { AttachmentStatus } from './entities/attachment.entity';
import { AttachmentResponseDto } from './dto/attachment-response.dto';
import { CreateAttachmentDto, CompleteAttachmentDto, AssociateAttachmentDto } from './dto/attachment.dto';

@ApiTags('Attachments')
@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(
    private readonly cleanupService: AttachmentCleanupService,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly integrityService: AttachmentIntegrityService,
    private readonly anonymousUserService: AnonymousUserService,
  ) {}

  /**
   * POST /attachments
   * Create a new attachment record for an upload.
   */
  @Post()
  @ApiOperation({ summary: 'Create attachment record for upload' })
  @ApiResponse({ status: 201, description: 'Attachment record created' })
  async createAttachment(@Body() dto: CreateAttachmentDto, @Req() req: any) {
    // KNOWN LIMITATION (out of scope for #2019): anonymousUserId here
    // still falls back to a placeholder when not supplied on the DTO.
    // Wiring this to AnonymousUserService.getOrCreateForUserSession is
    // tracked separately from this issue.
    const anonymousUserId = dto.anonymousUserId ?? (await this.getUserAnonymousId(req.user.id));

    const attachment = await this.cleanupService.createAttachment({
      ...dto,
      anonymousUserId,
    });

    return attachment;
  }

  /**
   * PUT /attachments/:id/complete
   */
  @Put(':id/complete')
  @ApiOperation({ summary: 'Mark attachment as completed' })
  @ApiParam({ name: 'id', description: 'Attachment UUID' })
  @ApiResponse({ status: 200, description: 'Attachment marked as completed' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async completeAttachment(@Param('id') id: string, @Body() dto: CompleteAttachmentDto) {
    const attachment = await this.attachmentRepository.findById(id);
    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    await this.cleanupService.completeAttachment(id, dto.checksum);
    return { success: true };
  }

  /**
   * PUT /attachments/:id/associate
   */
  @Put(':id/associate')
  @ApiOperation({ summary: 'Associate attachment with confession or message' })
  @ApiParam({ name: 'id', description: 'Attachment UUID' })
  @ApiResponse({ status: 200, description: 'Attachment associated successfully' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async associateAttachment(@Param('id') id: string, @Body() dto: AssociateAttachmentDto) {
    const attachment = await this.attachmentRepository.findById(id);
    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    await this.cleanupService.associateAttachment(id, {
      confessionId: dto.confessionId,
      messageId: dto.messageId,
    });

    return { success: true };
  }

  /**
   * GET /attachments/:id
   * Returns attachment details only to the owner, with storage
   * identifiers stripped and record consistency verified. (#2019)
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get attachment details' })
  @ApiParam({ name: 'id', description: 'Attachment UUID' })
  @ApiResponse({ status: 200, description: 'Attachment details', type: AttachmentResponseDto })
  @ApiResponse({ status: 404, description: 'Attachment unavailable' })
  async getAttachment(@Param('id') id: string, @Req() req: any): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findById(id);
    const ownedAnonymousIds = await this.anonymousUserService.getAnonIdsForUser(req.user.id);
    return this.integrityService.assertServableAndSanitize(attachment, ownedAnonymousIds);
  }

  /**
   * DELETE /attachments/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete attachment if not referenced' })
  @ApiParam({ name: 'id', description: 'Attachment UUID' })
  @ApiResponse({ status: 200, description: 'Attachment deleted' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  @ApiResponse({ status: 409, description: 'Attachment is still referenced' })
  async deleteAttachment(@Param('id') id: string) {
    const result = await this.cleanupService.cleanupAttachment(id);
    return result;
  }

  /**
   * POST /attachments/cleanup
   */
  @Post('cleanup')
  @ApiOperation({ summary: 'Trigger attachment cleanup job' })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  async triggerCleanup() {
    const result = await this.cleanupService.runCleanup();
    return result;
  }

  /**
   * GET /attachments/stats
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get attachment statistics' })
  @ApiResponse({ status: 200, description: 'Attachment statistics' })
  async getStats() {
    const statuses = Object.values(AttachmentStatus);
    const stats: Record<string, number> = {};

    for (const status of statuses) {
      const count = await this.attachmentRepository.find({ where: { status } });
      stats[status] = count.length;
    }

    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    return { total, byStatus: stats };
  }

  private async getUserAnonymousId(userId: number): Promise<string> {
    // Placeholder — see KNOWN LIMITATION note on createAttachment above.
    return `user-${userId}`;
  }
}
