import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Param,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { ConfessionDraftService } from './confession-draft.service';
import { CreateConfessionDraftDto } from './dto/create-confession-draft.dto';
import { ScheduleConfessionDraftDto } from './dto/schedule-confession-draft.dto';
import { UpdateConfessionDraftDto } from './dto/update-confession-draft.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';

@Controller('confessions/drafts')
@UseGuards(JwtAuthGuard)
export class ConfessionDraftController {
  constructor(private readonly service: ConfessionDraftService) {}

  @Post()
  create(@GetUser('id') userId: number, @Body() dto: CreateConfessionDraftDto) {
    return this.service.createDraft(
      userId,
      dto.content,
      dto.category,
      dto.scheduledFor,
      dto.timezone,
    );
  }

  @Post('autosave')
  autoSave(@GetUser('id') userId: number, @Body() dto: UpdateConfessionDraftDto) {
    return this.service.autoSaveDraft(userId, dto);
  }

  @Get()
  list(@GetUser('id') userId: number) {
    return this.service.listDrafts(userId);
  }

  @Get(':id')
  get(@GetUser('id') userId: number, @Param('id') id: string) {
    return this.service.getDraft(userId, id);
  }

  @Patch(':id')
  update(
    @GetUser('id') userId: number,
    @Param('id') id: string,
    @Body() dto: UpdateConfessionDraftDto,
  ) {
    return this.service.updateDraft(userId, id, dto);
  }

  @Patch(':id/autosave')
  autoSaveExisting(
    @GetUser('id') userId: number,
    @Param('id') id: string,
    @Body() dto: UpdateConfessionDraftDto,
  ) {
    return this.service.autoSaveDraft(userId, { ...dto, id });
  }

  @Delete()
  removeAll(@GetUser('id') userId: number) {
    return this.service.deleteAllDrafts(userId);
  }

  @Delete(':id')
  remove(@GetUser('id') userId: number, @Param('id') id: string) {
    return this.service.deleteDraft(userId, id);
  }

  @Post(':id/schedule')
  schedule(
    @GetUser('id') userId: number,
    @Param('id') id: string,
    @Body() dto: ScheduleConfessionDraftDto,
  ) {
    return this.service.scheduleDraft(
      userId,
      id,
      dto.scheduledFor,
      dto.timezone,
    );
  }

  @Post(':id/cancel')
  cancel(@GetUser('id') userId: number, @Param('id') id: string) {
    return this.service.cancelSchedule(userId, id);
  }

  @Post(':id/publish')
  publish(@GetUser('id') userId: number, @Param('id') id: string) {
    return this.service.publishNow(userId, id);
  }

  @Post(':id/convert-to-draft')
  convertToDraft(@GetUser('id') userId: number, @Param('id') id: string) {
    return this.service.convertPostedToDraft(userId, id);
  }
}
