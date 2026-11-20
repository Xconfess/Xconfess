import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export const JWT_PREVIOUS_SECRET_KEY = 'JWT_PREVIOUS_SECRET';
export const JWT_ROTATION_OVERLAP_SECONDS_KEY =
  'JWT_SECRET_ROTATION_OVERLAP_SECONDS';
export const DEFAULT_JWT_ROTATION_OVERLAP_SECONDS = 24 * 60 * 60;

type SecretProviderDone = (
  error: Error | null,
  secret?: string | Buffer,
) => void;

function readOverlapSeconds(configService: ConfigService): number {
  const configured = configService.get<number | string>(
    JWT_ROTATION_OVERLAP_SECONDS_KEY,
    DEFAULT_JWT_ROTATION_OVERLAP_SECONDS,
  );
  const parsed =
    typeof configured === 'number' ? configured : Number(configured);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_JWT_ROTATION_OVERLAP_SECONDS;
}

function isSignedWith(token: string, secret: string): boolean {
  try {
    jwt.verify(token, secret, {
      ignoreExpiration: true,
      ignoreNotBefore: true,
    });
    return true;
  } catch {
    return false;
  }
}

export function createJwtSecretProvider(configService: ConfigService) {
  const currentSecret = configService.get<string>('JWT_SECRET');
  const previousSecret = configService.get<string>(JWT_PREVIOUS_SECRET_KEY);
  const overlapSeconds = readOverlapSeconds(configService);

  return (
    _request: unknown,
    rawToken: string,
    done: SecretProviderDone,
  ): void => {
    try {
      if (!currentSecret) {
        done(new Error('JWT_SECRET is not configured'));
        return;
      }

      if (isSignedWith(rawToken, currentSecret)) {
        done(null, currentSecret);
        return;
      }

      if (previousSecret && isSignedWith(rawToken, previousSecret)) {
        const decoded = jwt.decode(rawToken) as jwt.JwtPayload | null;
        const issuedAt = typeof decoded?.iat === 'number' ? decoded.iat : 0;
        const ageSeconds = Math.max(0, Date.now() / 1000 - issuedAt);
        if (ageSeconds <= overlapSeconds) {
          done(null, previousSecret);
          return;
        }
        done(new Error('JWT signing key has retired'));
        return;
      }

      done(new Error('JWT token was not signed by a configured key'));
    } catch (error) {
      done(
        error instanceof Error ? error : new Error('JWT secret resolution failed'),
      );
    }
  };
}
