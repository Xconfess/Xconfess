import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  createJwtSecretProvider,
  DEFAULT_JWT_ROTATION_OVERLAP_SECONDS,
} from './jwt-secret-rotation';

const CURRENT = 'current-secret-with-at-least-thirty-two-characters';
const PREVIOUS = 'previous-secret-with-at-least-thirty-two-characters';

function config(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    JWT_SECRET: CURRENT,
    JWT_PREVIOUS_SECRET: PREVIOUS,
    JWT_SECRET_ROTATION_OVERLAP_SECONDS: DEFAULT_JWT_ROTATION_OVERLAP_SECONDS,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function resolve(
  provider: ReturnType<typeof createJwtSecretProvider>,
  token: string,
): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    provider({}, token, (error, secret) => {
      if (error) rejectPromise(error);
      else resolvePromise(String(secret));
    });
  });
}

describe('createJwtSecretProvider', () => {
  it('accepts tokens signed with the current key', async () => {
    const token = jwt.sign({ sub: 1 }, CURRENT);
    await expect(resolve(createJwtSecretProvider(config()), token)).resolves.toBe(
      CURRENT,
    );
  });

  it('accepts previous-key tokens inside the overlap window', async () => {
    const token = jwt.sign({ sub: 1 }, PREVIOUS);
    await expect(resolve(createJwtSecretProvider(config()), token)).resolves.toBe(
      PREVIOUS,
    );
  });

  it('rejects previous-key tokens older than the overlap window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { sub: 1, iat: now - DEFAULT_JWT_ROTATION_OVERLAP_SECONDS - 10 },
      PREVIOUS,
    );
    await expect(
      resolve(createJwtSecretProvider(config()), token),
    ).rejects.toThrow('retired');
  });

  it('rejects tokens signed by an unknown key', async () => {
    const token = jwt.sign({ sub: 1 }, 'unconfigured-secret');
    await expect(
      resolve(createJwtSecretProvider(config()), token),
    ).rejects.toThrow('configured key');
  });

  it('rejects previous-key tokens when no previous key is configured', async () => {
    const token = jwt.sign({ sub: 1 }, PREVIOUS);
    await expect(
      resolve(
        createJwtSecretProvider(config({ JWT_PREVIOUS_SECRET: undefined })),
        token,
      ),
    ).rejects.toThrow('configured key');
  });
});
