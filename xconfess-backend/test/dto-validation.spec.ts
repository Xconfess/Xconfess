import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { GetConfessionsDto, SortOrder, Gender } from '../src/confession/dto/get-confessions.dto';
import { ScheduleConfessionDto } from '../src/confession/dto/schedule-confession.dto';
import { SearchConfessionDto, SortBy } from '../src/confession/dto/search-confession.dto';
import { CreateReportDto } from '../src/report/dto/create-report.dto';
import { ReportType } from '../src/admin/entities/report.entity';

describe('DTO Validation Edge Cases', () => {
  describe('GetConfessionsDto', () => {
    it('should reject page less than 1', async () => {
      const dto = plainToClass(GetConfessionsDto, {
        page: 0,
        sort: SortOrder.NEWEST,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('page');
    });

    it('should reject negative page numbers', async () => {
      const dto = plainToClass(GetConfessionsDto, {
        page: -5,
        sort: SortOrder.NEWEST,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid page numbers', async () => {
      const dto = plainToClass(GetConfessionsDto, {
        page: 1,
        sort: SortOrder.NEWEST,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept page as string and transform to number', async () => {
      const dto = plainToClass(GetConfessionsDto, {
        page: '5',
        sort: SortOrder.NEWEST,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(typeof dto.page).toBe('number');
      expect(dto.page).toBe(5);
    });

    it('should reject invalid sort order', async () => {
      const dto = plainToClass(GetConfessionsDto, {
        page: 1,
        sort: 'invalid_sort',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('sort');
    });

    it('should accept all valid sort orders', async () => {
      const validSorts = [
        SortOrder.NEWEST,
        SortOrder.TRENDING,
        SortOrder.MOST_DISCUSSED,
      ];

      for (const sort of validSorts) {
        const dto = plainToClass(GetConfessionsDto, {
          page: 1,
          sort,
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    it('should accept optional gender filter', async () => {
      const dto = plainToClass(GetConfessionsDto, {
        page: 1,
        sort: SortOrder.NEWEST,
        gender: Gender.MALE,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.gender).toBe(Gender.MALE);
    });

    it('should reject invalid gender', async () => {
      const dto = plainToClass(GetConfessionsDto, {
        page: 1,
        sort: SortOrder.NEWEST,
        gender: 'invalid_gender',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should set defaults when values not provided', async () => {
      const dto = plainToClass(GetConfessionsDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.page).toBe(1);
      expect(dto.sort).toBe(SortOrder.NEWEST);
    });
  });

  describe('ScheduleConfessionDto', () => {
    it('should accept valid ISO date string', async () => {
      const dto = plainToClass(ScheduleConfessionDto, {
        publishAt: '2026-12-31T23:59:59Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid date string formats', async () => {
      const validDates = [
        '2026-12-31T00:00:00Z',
        '2026-01-01T12:30:45Z',
        '2027-06-15T18:45:30.123Z',
      ];

      for (const date of validDates) {
        const dto = plainToClass(ScheduleConfessionDto, {
          publishAt: date,
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    it('should reject invalid date string', async () => {
      const dto = plainToClass(ScheduleConfessionDto, {
        publishAt: 'not-a-date',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('publishAt');
    });

    it('should reject empty date string', async () => {
      const dto = plainToClass(ScheduleConfessionDto, {
        publishAt: '',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject null date', async () => {
      const dto = plainToClass(ScheduleConfessionDto, {
        publishAt: null,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject undefined required field', async () => {
      const dto = plainToClass(ScheduleConfessionDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('publishAt');
    });
  });

  describe('SearchConfessionDto', () => {
    it('should accept valid search query', async () => {
      const dto = plainToClass(SearchConfessionDto, {
        q: 'test search term',
        limit: 10,
        page: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty search query', async () => {
      const dto = plainToClass(SearchConfessionDto, {
        q: '',
        limit: 10,
        page: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept minimum length boundary', async () => {
      const dto = plainToClass(SearchConfessionDto, {
        q: 'a',
        limit: 10,
        page: 1,
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'q').length).toBe(0);
    });

    it('should reject query exceeding maximum length', async () => {
      const longQuery = 'a'.repeat(121);
      const dto = plainToClass(SearchConfessionDto, {
        q: longQuery,
        limit: 10,
        page: 1,
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'q').length).toBeGreaterThan(0);
    });

    it('should reject query with unsupported characters', async () => {
      const dto = plainToClass(SearchConfessionDto, {
        q: 'test<script>alert</script>',
        limit: 10,
        page: 1,
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'q').length).toBeGreaterThan(0);
    });

    it('should reject negative limit', async () => {
      const dto = plainToClass(SearchConfessionDto, {
        q: 'test',
        limit: -1,
        page: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject zero limit', async () => {
      const dto = plainToClass(SearchConfessionDto, {
        q: 'test',
        limit: 0,
        page: 1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid page numbers', async () => {
      const dto = plainToClass(SearchConfessionDto, {
        q: 'test',
        limit: 10,
        page: 1,
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'page').length).toBe(0);
    });

    it('should reject invalid sort order', async () => {
      const dto = plainToClass(SearchConfessionDto, {
        q: 'test',
        limit: 10,
        page: 1,
        sortBy: 'invalid_sort',
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'sortBy').length).toBeGreaterThan(0);
    });

    it('should accept all valid sort orders', async () => {
      const validSorts = [SortBy.DATE, SortBy.REACTIONS, SortBy.VIEWS, SortBy.RELEVANCE];

      for (const sortBy of validSorts) {
        const dto = plainToClass(SearchConfessionDto, {
          q: 'test',
          limit: 10,
          page: 1,
          sortBy,
        });

        const errors = await validate(dto);
        expect(errors.filter(e => e.property === 'sortBy').length).toBe(0);
      }
    });
  });

  describe('CreateReportDto', () => {
    it('should accept valid report with required fields', async () => {
      const dto = plainToClass(CreateReportDto, {
        type: ReportType.CONFESSION,
        reason: 'Inappropriate content',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept report with type only', async () => {
      const dto = plainToClass(CreateReportDto, {
        type: ReportType.CONFESSION,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate all report types', async () => {
      const validTypes = Object.values(ReportType);

      for (const type of validTypes) {
        const dto = plainToClass(CreateReportDto, {
          type,
          reason: 'Test report',
        });

        const errors = await validate(dto);
        expect(errors.filter(e => e.property === 'type').length).toBe(0);
      }
    });

    it('should reject invalid report type', async () => {
      const dto = plainToClass(CreateReportDto, {
        type: 'INVALID_TYPE',
        reason: 'Test',
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'type').length).toBeGreaterThan(0);
    });

    it('should reject empty reason string', async () => {
      const dto = plainToClass(CreateReportDto, {
        type: ReportType.CONFESSION,
        reason: '',
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'reason').length).toBeGreaterThan(0);
    });

    it('should reject reason exceeding maximum length', async () => {
      const longReason = 'a'.repeat(501);
      const dto = plainToClass(CreateReportDto, {
        type: ReportType.CONFESSION,
        reason: longReason,
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'reason').length).toBeGreaterThan(0);
    });

    it('should accept reason at boundary length', async () => {
      const boundaryReason = 'a'.repeat(500);
      const dto = plainToClass(CreateReportDto, {
        type: ReportType.CONFESSION,
        reason: boundaryReason,
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'reason').length).toBe(0);
    });

    it('should trim whitespace from reason', async () => {
      const dto = plainToClass(CreateReportDto, {
        type: ReportType.CONFESSION,
        reason: '  Test reason  ',
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'reason').length).toBe(0);
      expect(dto.reason).toBe('Test reason');
    });

    it('should reject missing type field', async () => {
      const dto = plainToClass(CreateReportDto, {
        reason: 'Test',
      });

      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'type').length).toBeGreaterThan(0);
    });
  });

  describe('Validation Error Predictability', () => {
    it('should provide consistent error messages for same violation', async () => {
      const dto1 = plainToClass(GetConfessionsDto, { page: -1, sort: SortOrder.NEWEST });
      const dto2 = plainToClass(GetConfessionsDto, { page: -1, sort: SortOrder.NEWEST });

      const errors1 = await validate(dto1);
      const errors2 = await validate(dto2);

      expect(errors1.length).toBe(errors2.length);
      expect(errors1[0].property).toBe(errors2[0].property);
    });

    it('should include validation constraints in error object', async () => {
      const dto = plainToClass(GetConfessionsDto, { page: 0 });

      const errors = await validate(dto);
      expect(errors[0]).toHaveProperty('constraints');
      expect(typeof errors[0].constraints).toBe('object');
    });

    it('should maintain validation consistency across multiple calls', async () => {
      const testData = {
        page: 5,
        sort: SortOrder.TRENDING,
        gender: Gender.FEMALE,
      };

      for (let i = 0; i < 5; i++) {
        const dto = plainToClass(GetConfessionsDto, testData);
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });
  });
});
