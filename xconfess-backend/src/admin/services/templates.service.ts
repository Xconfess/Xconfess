import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplate } from '../../database/entities/notification-template.entity';
import { TemplateVersion } from '../../database/entities/template-version.entity';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(NotificationTemplate)
    private templateRepo: Repository<NotificationTemplate>,
    @InjectRepository(TemplateVersion)
    private versionRepo: Repository<TemplateVersion>,
  ) {}

  async findAll() {
    return await this.templateRepo.find({ relations: ['currentVersion'] });
  }

  async getHistory(templateId: string) {
    return await this.versionRepo.find({
      where: { template: { id: templateId } },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, updateDto: { content: string; isActive: boolean }) {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');

    // Update status
    template.isActive = updateDto.isActive;
    await this.templateRepo.save(template);

    // Create new version
    const lastVersion = await this.versionRepo.findOne({
      where: { template: { id } },
      order: { versionNumber: 'DESC' },
    });

    const newVersion = this.versionRepo.create({
      template,
      content: updateDto.content,
      versionNumber: (lastVersion?.versionNumber || 0) + 1,
    });

    await this.versionRepo.save(newVersion);
    
    // Update current pointer
    template.currentVersion = newVersion;
    return await this.templateRepo.save(template);
  }
}