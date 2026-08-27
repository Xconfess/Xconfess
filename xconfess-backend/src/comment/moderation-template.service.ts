import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ModerationNoteTemplate,
  TemplateCategory,
} from './entities/moderation-note-template.entity';

export interface CreateTemplateDto {
  name: string;
  content: string;
  category: TemplateCategory;
}

export interface UpdateTemplateDto {
  name?: string;
  content?: string;
  category?: TemplateCategory;
  isActive?: boolean;
}

@Injectable()
export class ModerationTemplateService {
  constructor(
    @InjectRepository(ModerationNoteTemplate)
    private readonly templateRepository: Repository<ModerationNoteTemplate>,
  ) {}

  async create(
    dto: CreateTemplateDto,
    adminId: number,
  ): Promise<ModerationNoteTemplate> {
    const template = this.templateRepository.create({
      ...dto,
      createdById: adminId,
      isActive: true,
    });
    return this.templateRepository.save(template);
  }

  async findAll(includeInactive = false): Promise<ModerationNoteTemplate[]> {
    const query = this.templateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.createdBy', 'createdBy')
      .orderBy('template.category', 'ASC')
      .addOrderBy('template.name', 'ASC');

    if (!includeInactive) {
      query.andWhere('template.isActive = :isActive', { isActive: true });
    }

    return query.getMany();
  }

  async findById(id: number): Promise<ModerationNoteTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async findByCategory(
    category: TemplateCategory,
  ): Promise<ModerationNoteTemplate[]> {
    return this.templateRepository.find({
      where: { category, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async update(
    id: number,
    dto: UpdateTemplateDto,
  ): Promise<ModerationNoteTemplate> {
    const template = await this.findById(id);
    Object.assign(template, dto);
    return this.templateRepository.save(template);
  }

  async delete(id: number): Promise<void> {
    const template = await this.findById(id);
    await this.templateRepository.remove(template);
  }

  async getTemplateContent(id: number): Promise<string | null> {
    const template = await this.templateRepository.findOne({
      where: { id, isActive: true },
    });
    return template?.content ?? null;
  }
}
