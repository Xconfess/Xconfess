import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTemplateDto, UpdateTemplateDto } from '../admin.controller';
import { TemplateCategory } from '../../comment/entities/moderation-note-template.entity';

describe('Moderation Template DTOs', () => {
  describe('CreateTemplateDto', () => {
    it('should pass with valid minimum inputs', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 'A',
        content: 'x',
        category: TemplateCategory.INFO,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with valid maximum name (100 chars)', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 'a'.repeat(100),
        content: 'Valid content',
        category: TemplateCategory.WARNING,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with valid long content', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 'Test',
        content: 'x'.repeat(10000),
        category: TemplateCategory.REJECTION,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass for all valid categories', async () => {
      for (const cat of Object.values(TemplateCategory)) {
        const dto = plainToInstance(CreateTemplateDto, {
          name: 'Test',
          content: 'Content',
          category: cat,
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    it('should fail when name is missing', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        content: 'Content',
        category: TemplateCategory.INFO,
      });
      const errors = await validate(dto);
      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
      expect(nameErrors[0].constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail when content is missing', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 'Test',
        category: TemplateCategory.INFO,
      });
      const errors = await validate(dto);
      const contentErrors = errors.filter((e) => e.property === 'content');
      expect(contentErrors.length).toBeGreaterThan(0);
      expect(contentErrors[0].constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail when category is missing', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 'Test',
        content: 'Content',
      });
      const errors = await validate(dto);
      const catErrors = errors.filter((e) => e.property === 'category');
      expect(catErrors.length).toBeGreaterThan(0);
      expect(catErrors[0].constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail when name exceeds 100 characters', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 'a'.repeat(101),
        content: 'Content',
        category: TemplateCategory.INFO,
      });
      const errors = await validate(dto);
      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
      expect(nameErrors[0].constraints).toHaveProperty('maxLength');
    });

    it('should fail when name is empty string', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: '',
        content: 'Content',
        category: TemplateCategory.INFO,
      });
      const errors = await validate(dto);
      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });

    it('should fail when content is empty string', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 'Test',
        content: '',
        category: TemplateCategory.INFO,
      });
      const errors = await validate(dto);
      const contentErrors = errors.filter((e) => e.property === 'content');
      expect(contentErrors.length).toBeGreaterThan(0);
    });

    it('should fail when category is invalid enum value', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 'Test',
        content: 'Content',
        category: 'INVALID_CATEGORY',
      });
      const errors = await validate(dto);
      const catErrors = errors.filter((e) => e.property === 'category');
      expect(catErrors.length).toBeGreaterThan(0);
      expect(catErrors[0].constraints).toHaveProperty('isEnum');
    });

    it('should fail when name is not a string', async () => {
      const dto = plainToInstance(CreateTemplateDto, {
        name: 123,
        content: 'Content',
        category: TemplateCategory.INFO,
      });
      const errors = await validate(dto);
      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
      expect(nameErrors[0].constraints).toHaveProperty('isString');
    });

    it('should fail when all required fields are missing', async () => {
      const dto = plainToInstance(CreateTemplateDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(3);
    });
  });

  describe('UpdateTemplateDto', () => {
    it('should pass with no fields (all optional)', async () => {
      const dto = plainToInstance(UpdateTemplateDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with valid partial name only', async () => {
      const dto = plainToInstance(UpdateTemplateDto, { name: 'New Name' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with valid partial content only', async () => {
      const dto = plainToInstance(UpdateTemplateDto, {
        content: 'New content',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with valid partial category only', async () => {
      const dto = plainToInstance(UpdateTemplateDto, {
        category: TemplateCategory.WARNING,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with all fields', async () => {
      const dto = plainToInstance(UpdateTemplateDto, {
        name: 'Updated',
        content: 'Updated content',
        category: TemplateCategory.REJECTION,
        isActive: false,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when name exceeds 100 characters', async () => {
      const dto = plainToInstance(UpdateTemplateDto, {
        name: 'a'.repeat(101),
      });
      const errors = await validate(dto);
      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });

    it('should fail when name is empty string', async () => {
      const dto = plainToInstance(UpdateTemplateDto, { name: '' });
      const errors = await validate(dto);
      const nameErrors = errors.filter((e) => e.property === 'name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });

    it('should fail when content is empty string', async () => {
      const dto = plainToInstance(UpdateTemplateDto, { content: '' });
      const errors = await validate(dto);
      const contentErrors = errors.filter((e) => e.property === 'content');
      expect(contentErrors.length).toBeGreaterThan(0);
    });

    it('should fail when category is invalid enum value', async () => {
      const dto = plainToInstance(UpdateTemplateDto, {
        category: 'bad_value',
      });
      const errors = await validate(dto);
      const catErrors = errors.filter((e) => e.property === 'category');
      expect(catErrors.length).toBeGreaterThan(0);
    });
  });
});
