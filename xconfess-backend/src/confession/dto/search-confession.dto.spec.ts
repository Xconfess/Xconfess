import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchConfessionDto } from './search-confession.dto';

const validateQuery = (query: Record<string, unknown>) =>
  validate(plainToInstance(SearchConfessionDto, query));

const messagesFor = async (query: Record<string, unknown>) =>
  (await validateQuery(query)).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );

describe('SearchConfessionDto', () => {
  it('rejects an empty search term after trimming whitespace', async () => {
    const messages = await messagesFor({ q: '   ', page: '1', limit: '10' });

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('q should not be empty'),
      ]),
    );
  });

  it('rejects search terms over the documented maximum length', async () => {
    const messages = await messagesFor({
      q: 'a'.repeat(101),
      page: '1',
      limit: '10',
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'q must be shorter than or equal to 100 characters',
        ),
      ]),
    );
  });

  it('rejects unsupported search characters before the repository layer', async () => {
    const messages = await messagesFor({
      q: '<script>alert(1)</script>',
      page: '1',
      limit: '10',
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'q can only contain letters, numbers, spaces, and common punctuation',
        ),
      ]),
    );
  });

  it('rejects limits above the documented maximum', async () => {
    const messages = await messagesFor({ q: 'stress', page: '1', limit: '51' });

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('limit must not be greater than 50'),
      ]),
    );
  });
});
