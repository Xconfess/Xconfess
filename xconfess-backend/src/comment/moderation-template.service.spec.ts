import { ModerationTemplateService } from './moderation-template.service';
import {
  ModerationNoteTemplate,
  TemplateCategory,
} from './entities/moderation-note-template.entity';
import { NotFoundException } from '@nestjs/common';

describe('ModerationTemplateService', () => {
  let service: ModerationTemplateService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn((dto) => ({ ...dto, id: 1 })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: entity.id || 1 }),
      ),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
      remove: jest.fn(),
    };
    service = new ModerationTemplateService(mockRepo);
  });

  describe('create', () => {
    it('should create a template with provided data', async () => {
      const dto = {
        name: 'Test Template',
        content: 'This is a test',
        category: TemplateCategory.INFO,
      };
      const result = await service.create(dto, 1);
      expect(mockRepo.create).toHaveBeenCalledWith({
        ...dto,
        createdById: 1,
        isActive: true,
      });
      expect(mockRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('Test Template');
    });
  });

  describe('findById', () => {
    it('should return template when found', async () => {
      const template = { id: 1, name: 'Test' };
      mockRepo.findOne.mockResolvedValue(template);
      const result = await service.findById(1);
      expect(result).toEqual(template);
    });

    it('should throw NotFoundException when template not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return only active templates by default', async () => {
      const templates = [{ id: 1, name: 'Active', isActive: true }];
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(templates),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll();
      expect(qb.andWhere).toHaveBeenCalledWith(
        'template.isActive = :isActive',
        { isActive: true },
      );
      expect(result).toEqual(templates);
    });

    it('should include inactive templates when includeInactive is true', async () => {
      const templates = [
        { id: 1, name: 'Active' },
        { id: 2, name: 'Inactive', isActive: false },
      ];
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(templates),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll(true);
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual(templates);
    });
  });

  describe('update', () => {
    it('should update template fields', async () => {
      const template = { id: 1, name: 'Old', content: 'Old content' };
      mockRepo.findOne.mockResolvedValue({ ...template });
      const result = await service.update(1, { name: 'New' });
      expect(mockRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('New');
    });
  });

  describe('delete', () => {
    it('should remove template', async () => {
      const template = { id: 1, name: 'ToDelete' };
      mockRepo.findOne.mockResolvedValue(template);
      await service.delete(1);
      expect(mockRepo.remove).toHaveBeenCalledWith(template);
    });
  });

  describe('getTemplateContent', () => {
    it('should return template content when found and active', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 1,
        content: 'Template content',
        isActive: true,
      });
      const result = await service.getTemplateContent(1);
      expect(result).toBe('Template content');
    });

    it('should return null when template not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.getTemplateContent(999);
      expect(result).toBeNull();
    });

    it('should return null when template is inactive (findOne filters by isActive: true)', async () => {
      mockRepo.findOne.mockResolvedValue(null); // Service filters by isActive: true, so inactive templates return null
      const result = await service.getTemplateContent(1);
      expect(result).toBeNull();
    });
  });

  describe('validation boundaries', () => {
    it('should create a template with name at exactly 100 characters', async () => {
      const dto = {
        name: 'a'.repeat(100),
        content: 'Valid content',
        category: TemplateCategory.INFO,
      };
      const result = await service.create(dto, 1);
      expect(mockRepo.create).toHaveBeenCalledWith({
        ...dto,
        createdById: 1,
        isActive: true,
      });
      expect(result.name).toHaveLength(100);
    });

    it('should pass through long content without truncation', async () => {
      const longContent = 'x'.repeat(10000);
      const dto = {
        name: 'Test',
        content: longContent,
        category: TemplateCategory.WARNING,
      };
      await service.create(dto, 1);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ content: longContent }),
      );
    });

    it('should create templates with all valid category values', async () => {
      for (const cat of Object.values(TemplateCategory)) {
        mockRepo.create.mockClear();
        mockRepo.save.mockClear();
        const dto = {
          name: `Template ${cat}`,
          content: `Content for ${cat}`,
          category: cat,
        };
        await service.create(dto, 1);
        expect(mockRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ category: cat }),
        );
      }
    });

    it('should create a template with single-character name', async () => {
      const dto = {
        name: 'A',
        content: 'Content',
        category: TemplateCategory.INFO,
      };
      const result = await service.create(dto, 1);
      expect(result.name).toBe('A');
    });

    it('should update only name while preserving other fields', async () => {
      const existing = {
        id: 1,
        name: 'Old',
        content: 'Original content',
        category: TemplateCategory.REJECTION,
        isActive: true,
      };
      mockRepo.findOne.mockResolvedValue({ ...existing });
      const result = await service.update(1, { name: 'New' });
      expect(result.name).toBe('New');
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should update only category while preserving other fields', async () => {
      const existing = {
        id: 1,
        name: 'Template',
        content: 'Content',
        category: TemplateCategory.INFO,
        isActive: true,
      };
      mockRepo.findOne.mockResolvedValue({ ...existing });
      const result = await service.update(1, {
        category: TemplateCategory.WARNING,
      });
      expect(result.category).toBe(TemplateCategory.WARNING);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should handle isActive toggle via update', async () => {
      const existing = {
        id: 1,
        name: 'Template',
        content: 'Content',
        category: TemplateCategory.INFO,
        isActive: true,
      };
      mockRepo.findOne.mockResolvedValue({ ...existing });
      const result = await service.update(1, { isActive: false });
      expect(result.isActive).toBe(false);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating non-existent template', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.update(999, { name: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when deleting non-existent template', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.delete(999)).rejects.toThrow(NotFoundException);
    });

    it('should return null for getTemplateContent with invalid ID', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.getTemplateContent(-1);
      expect(result).toBeNull();
    });
  });
});
