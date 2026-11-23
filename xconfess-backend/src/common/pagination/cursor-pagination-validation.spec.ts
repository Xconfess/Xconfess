import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CursorPaginationDto } from './cursor-pagination.dto';
import { encodeCursor } from './cursor.util';
import { PAGINATION } from './pagination.constants';

async function validateDto(plain: object): Promise<string[]> {
  const dto = plainToInstance(CursorPaginationDto, plain);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CursorPaginationDto — centralised pagination validation (#1995)', () => {
  describe('cursor field', () => {
    it('accepts a valid cursor token', async () => {
      const cursor = encodeCursor({ id: 'abc', createdAt: '2026-01-01' });
      const errors = await validateDto({ cursor });
      expect(errors).toHaveLength(0);
    });

    it('accepts an absent cursor (optional)', async () => {
      const errors = await validateDto({});
      expect(errors).toHaveLength(0);
    });

    it('rejects a plaintext (non-base64-JSON) cursor', async () => {
      const errors = await validateDto({ cursor: 'not-a-cursor' });
      expect(errors.some((e) => e.includes('cursor'))).toBe(true);
    });

    it('rejects valid base64 that decodes to a non-object', async () => {
      const bad = Buffer.from('"just a string"').toString('base64');
      const errors = await validateDto({ cursor: bad });
      expect(errors.some((e) => e.includes('cursor'))).toBe(true);
    });

    it('rejects valid base64 JSON without an id field', async () => {
      const bad = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64');
      const errors = await validateDto({ cursor: bad });
      expect(errors.some((e) => e.includes('cursor'))).toBe(true);
    });
  });

  describe('limit field', () => {
    it('accepts the default limit', async () => {
      const errors = await validateDto({});
      expect(errors).toHaveLength(0);
    });

    it('accepts the minimum limit', async () => {
      const errors = await validateDto({ limit: PAGINATION.MIN_LIMIT });
      expect(errors).toHaveLength(0);
    });

    it('accepts the maximum limit', async () => {
      const errors = await validateDto({ limit: PAGINATION.MAX_LIMIT });
      expect(errors).toHaveLength(0);
    });

    it('rejects a limit of 0 (below minimum)', async () => {
      const errors = await validateDto({ limit: 0 });
      expect(errors.some((e) => e.includes('limit'))).toBe(true);
    });

    it('rejects a limit above the maximum', async () => {
      const errors = await validateDto({ limit: PAGINATION.MAX_LIMIT + 1 });
      expect(errors.some((e) => e.includes('limit'))).toBe(true);
    });

    it('rejects a non-integer limit', async () => {
      const errors = await validateDto({ limit: 5.5 });
      expect(errors.some((e) => e.includes('limit'))).toBe(true);
    });
  });
});
