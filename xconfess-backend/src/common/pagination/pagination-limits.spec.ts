import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetConfessionsDto } from '../../confession/dto/get-confessions.dto';
import { GetConfessionsByTagDto } from '../../confession/dto/get-confessions-by-tag.dto';
import { GetCommentsQueryDto } from '../../comment/dto/get-comments-query.dto';
import { SearchConfessionDto } from '../../confession/dto/search-confession.dto';
import { NotificationQueryDto } from '../../notifications/dto/notification.dto';
import { GetDeletedConfessionsDto } from '../../confession/dto/get-deleted-confessions.dto';
import { UserListQueryDto } from '../../user/dto/list-query.dto';

const endpointLimitDtos = [
  { endpoint: 'feed', dto: GetConfessionsDto, required: {} },
  { endpoint: 'tag feed', dto: GetConfessionsByTagDto, required: {} },
  { endpoint: 'search', dto: SearchConfessionDto, required: { q: 'test' } },
  { endpoint: 'comments', dto: GetCommentsQueryDto, required: {} },
  { endpoint: 'notifications', dto: NotificationQueryDto, required: {} },
];

describe('pagination limits - shared constraints', () => {
  describe.each(endpointLimitDtos)('$endpoint limit', ({ dto, required }) => {
    it('uses a bounded default when limit is missing', async () => {
      const instance = plainToInstance(dto, required);
      expect(instance.limit).toBeGreaterThan(0);
      expect(instance.limit).toBeLessThanOrEqual(100);
      expect(await validate(instance)).toHaveLength(0);
    });

    it.each([-1, 0, 101, '10invalid'])(
      'rejects limit %p',
      async (limit) => {
        const instance = plainToInstance(dto, { ...required, limit });
        const errors = await validate(instance);
        expect(errors.some((error) => error.property === 'limit')).toBe(true);
      },
    );
  });

  it('GetConfessionsDto rejects limit > 100', async () => {
    const dto = plainToInstance(GetConfessionsDto, { limit: 101 });
    const errs = await validate(dto);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('NotificationQueryDto extends PaginationDto and enforces limit bounds', async () => {
    const bad = plainToInstance(NotificationQueryDto, { limit: 0, unreadOnly: 'true' });
    const errs = await validate(bad);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('SearchConfessionDto enforces page <= 1000', async () => {
    const ok = plainToInstance(SearchConfessionDto, { q: 'test', page: 1000 });
    const errsOk = await validate(ok);
    expect(errsOk.length).toBe(0);

    const bad = plainToInstance(SearchConfessionDto, { q: 'test', page: 1001 });
    const errsBad = await validate(bad);
    expect(errsBad.length).toBeGreaterThan(0);
  });

  it('GetConfessionsByTagDto enforces max page', async () => {
    const bad = plainToInstance(GetConfessionsByTagDto, { page: 1001 });
    const errs = await validate(bad);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('GetCommentsQueryDto enforces max page', async () => {
    const bad = plainToInstance(GetCommentsQueryDto, { page: 1001 });
    const errs = await validate(bad);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('GetDeletedConfessionsDto defaults to limit 50 and validates', async () => {
    const inst = plainToInstance(GetDeletedConfessionsDto, {});
    expect(inst.limit).toBe(50);
    const errs = await validate(inst);
    expect(errs.length).toBe(0);
  });

  it('UserListQueryDto defaults to limit 10', async () => {
    const inst = plainToInstance(UserListQueryDto, {});
    expect(inst.limit).toBe(10);
    const errs = await validate(inst);
    expect(errs.length).toBe(0);
  });

  it('rejects negative and zero and malformed', async () => {
    const c1 = await validate(plainToInstance(GetConfessionsDto, { limit: -1 }));
    const c2 = await validate(plainToInstance(GetConfessionsDto, { limit: 0 }));
    const c3 = await validate(plainToInstance(GetConfessionsDto, { limit: 'abc' }));
    expect(c1.length).toBeGreaterThan(0);
    expect(c2.length).toBeGreaterThan(0);
    expect(c3.length).toBeGreaterThan(0);
  });
});
