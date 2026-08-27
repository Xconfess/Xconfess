import * as crypto from 'crypto';

const ENCRYPTION_KEY =
  process.env.EMAIL_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  tag: string;
}

export class CryptoUtil {
  static encrypt(text: string): EncryptionResult {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );

    const encrypted =
      cipher.update(text, 'utf8', 'base64') + cipher.final('base64');
    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  static decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY),
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    return (
      decipher.update(encrypted, 'base64', 'utf8') + decipher.final('utf8')
    );
  }

  static hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}
