import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    const keyString = this.configService.get<string>(
      'CONFESSION_ENCRYPTION_KEY',
    );
    if (!keyString) {
      throw new Error(
        'CONFESSION_ENCRYPTION_KEY must be set in environment variables',
      );
    }
    this.key = Buffer.from(keyString, 'hex');
    if (this.key.length !== 32) {
      throw new Error(
        'CONFESSION_ENCRYPTION_KEY must be 32 bytes (64 hex characters)',
      );
    }
  }

  encrypt(text: string): string {
    if (!text) return text;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;

    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }

  encryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields: string[],
  ): T {
    const result = { ...obj };

    for (const field of fields) {
      const value = result[field];
      if (typeof value === 'string') {
        (result as Record<string, unknown>)[field] = this.encrypt(value);
      }
    }

    return result;
  }

  decryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields: string[],
  ): T {
    const result = { ...obj };

    for (const field of fields) {
      const value = result[field];
      if (typeof value === 'string') {
        (result as Record<string, unknown>)[field] = this.decrypt(value);
      }
    }

    return result;
  }
}
