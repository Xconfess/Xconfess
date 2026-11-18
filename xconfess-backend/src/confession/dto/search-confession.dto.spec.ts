import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchConfessionDto } from './search-confession.dto';

async function qErrors(q: string): Promise<string[]> {
  const dto = plainToInstance(SearchConfessionDto, { q });
  const errors = await validate(dto);
  return errors
    .filter((error) => error.property === 'q')
    .flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('SearchConfessionDto q validation', () => {
  it('accepts Unicode letters from any script', async () => {
    expect(await qErrors('東京 タワー')).toEqual([]);
    expect(await qErrors('مرحبا')).toEqual([]);
    expect(await qErrors('Café déjà vu')).toEqual([]);
  });

  it('accepts combining marks such as Devanagari vowel signs', async () => {
    expect(await qErrors('नमस्ते')).toEqual([]);
  });

  it('still rejects markup characters', async () => {
    expect((await qErrors('<script>alert(1)</script>')).length).toBeGreaterThan(
      0,
    );
  });
});
