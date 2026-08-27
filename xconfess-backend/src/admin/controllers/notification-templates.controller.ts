import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { TemplatesService } from '../services/templates.service';

@Controller('admin/templates')
export class NotificationTemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  findAll() {
    return this.templatesService.findAll();
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.templatesService.getHistory(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.templatesService.update(id, body);
  }
}