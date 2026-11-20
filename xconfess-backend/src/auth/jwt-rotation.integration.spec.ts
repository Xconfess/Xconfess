import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import {
  createJwtSecretProvider,
  DEFAULT_JWT_ROTATION_OVERLAP_SECONDS,
} from './jwt-secret-rotation';

const CURRENT = 'integration-current-secret-with-at-least-thirty-two-chars';
const PREVIOUS = 'integration-previous-secret-with-thirty-two-chars';

function config(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('JWT secret rotation (integration)', () => {
  function service(values: Record<string, unknown>): JwtService {
    return new JwtService({
      secret: CURRENT,
      secretOrKeyProvider: createJwtSecretProvider(config(values)),
      signOptions: { expiresIn: '1d' },
    });
  }

  it('verifies sessions issued before the rotation during the overlap', () => {
    const token = jwt.sign({ sub: 42 }, PREVIOUS, { expiresIn: '1d' });
    const verifier = service({
      JWT_SECRET: CURRENT,
      JWT_PREVIOUS_SECRET: PREVIOUS,
      JWT_SECRET_ROTATION_OVERLAP_SECONDS:
        DEFAULT_JWT_ROTATION_OVERLAP_SECONDS,
    });

    expect(verifier.verify(token)).toMatchObject({ sub: 42 });
  });

  it('verifies sessions issued after the rotation with the new key', () => {
    const verifier = service({
      JWT_SECRET: CURRENT,
      JWT_PREVIOUS_SECRET: PREVIOUS,
      JWT_SECRET_ROTATION_OVERLAP_SECONDS:
        DEFAULT_JWT_ROTATION_OVERLAP_SECONDS,
    });
    const token = verifier.sign({ sub: 43 });

    expect(verifier.verify(token)).toMatchObject({ sub: 43 });
  });

  it('rejects retired-key sessions after the overlap closes', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        sub: 44,
        iat: now - DEFAULT_JWT_ROTATION_OVERLAP_SECONDS - 60,
        exp: now + 3600,
      },
      PREVIOUS,
    );
    const verifier = service({
      JWT_SECRET: CURRENT,
      JWT_PREVIOUS_SECRET: PREVIOUS,
      JWT_SECRET_ROTATION_OVERLAP_SECONDS:
        DEFAULT_JWT_ROTATION_OVERLAP_SECONDS,
    });

    expect(() => verifier.verify(token)).toThrow();
  });
});
