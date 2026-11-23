import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto } from './pagination.dto';
import { CursorPaginationDto } from './cursor-pagination.dto';
import { PAGINATION } from './pagination.constants';

async function getErrors(instance: any) {
  const errors = await validate(instance);
  return errors.flatMap((e) => Object.values(e.constraints || {}));
}

describe('PaginationDto — shared limit standardization', () => {
  describe('missing values → defaults applied', () => {
    it('defaults page and limit when omitted', async () => {
      const dto = plainToInstance(PaginationDto, {});
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(PAGINATION.DEFAULT_PAGE);
      expect(dto.limit).toBe(PAGINATION.DEFAULT_LIMIT);
    });

    it('defaults page when only limit is provided', async () => {
      const dto = plainToInstance(PaginationDto, { limit: 10 });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(PAGINATION.DEFAULT_PAGE);
      expect(dto.limit).toBe(10);
    });

    it('defaults limit when only page is provided', async () => {
      const dto = plainToInstance(PaginationDto, { page: 3 });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(3);
      expect(dto.limit).toBe(PAGINATION.DEFAULT_LIMIT);
    });
  });

  describe('negative values → rejected', () => {
    it('rejects negative page', async () => {
      const dto = plainToInstance(PaginationDto, { page: -1, limit: 10 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((m) => m.includes('page'))).toBe(true);
    });

    it('rejects negative limit', async () => {
      const dto = plainToInstance(PaginationDto, { page: 1, limit: -5 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((m) => m.includes('limit'))).toBe(true);
    });
  });

  describe('zero values → rejected (pages are 1-indexed, min limit is 1)', () => {
    it('rejects page of 0', async () => {
      const dto = plainToInstance(PaginationDto, { page: 0, limit: 10 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects limit of 0', async () => {
      const dto = plainToInstance(PaginationDto, { page: 1, limit: 0 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('oversized values → rejected (not silently clamped)', () => {
    it('rejects limit above MAX_LIMIT', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: 1,
        limit: PAGINATION.MAX_LIMIT + 1,
      });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((m) => m.includes('limit'))).toBe(true);
    });

    it('accepts limit exactly at MAX_LIMIT', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: 1,
        limit: PAGINATION.MAX_LIMIT,
      });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts limit exactly at MIN_LIMIT', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: 1,
        limit: PAGINATION.MIN_LIMIT,
      });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('malformed values → rejected', () => {
    it('rejects non-integer page', async () => {
      const dto = plainToInstance(PaginationDto, { page: 2.5, limit: 10 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects non-integer limit', async () => {
      const dto = plainToInstance(PaginationDto, { page: 1, limit: 10.5 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects non-numeric page string', async () => {
      const dto = plainToInstance(PaginationDto, { page: 'abc', limit: 10 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects non-numeric limit string', async () => {
      const dto = plainToInstance(PaginationDto, { page: 1, limit: 'xyz' });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects null page', async () => {
      const dto = plainToInstance(PaginationDto, { page: null, limit: 10 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects undefined limit explicitly passed', async () => {
      // @IsOptional means undefined is allowed → default applies
      const dto = plainToInstance(PaginationDto, { page: 1, limit: undefined });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
      expect(dto.limit).toBe(PAGINATION.DEFAULT_LIMIT);
    });
  });
});

describe('CursorPaginationDto — shared limit standardization', () => {
  describe('missing limit → default applied', () => {
    it('defaults limit when omitted', async () => {
      const dto = plainToInstance(CursorPaginationDto, {});
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
      expect(dto.limit).toBe(PAGINATION.DEFAULT_LIMIT);
    });
  });

  describe('boundary values', () => {
    it('accepts MIN_LIMIT', async () => {
      const dto = plainToInstance(CursorPaginationDto, {
        limit: PAGINATION.MIN_LIMIT,
      });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts MAX_LIMIT', async () => {
      const dto = plainToInstance(CursorPaginationDto, {
        limit: PAGINATION.MAX_LIMIT,
      });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects limit above MAX_LIMIT', async () => {
      const dto = plainToInstance(CursorPaginationDto, {
        limit: PAGINATION.MAX_LIMIT + 1,
      });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects zero limit', async () => {
      const dto = plainToInstance(CursorPaginationDto, { limit: 0 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects negative limit', async () => {
      const dto = plainToInstance(CursorPaginationDto, { limit: -1 });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects malformed limit string', async () => {
      const dto = plainToInstance(CursorPaginationDto, { limit: 'not-a-number' });
      const errors = await getErrors(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('cursor is optional and unconstrained', () => {
    it('accepts a valid opaque cursor', async () => {
      const dto = plainToInstance(CursorPaginationDto, {
        cursor: 'eyJpZCI6MTIzfQ==',
        limit: 20,
      });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts no cursor', async () => {
      const dto = plainToInstance(CursorPaginationDto, { limit: 20 });
      const errors = await getErrors(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
