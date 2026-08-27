import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Envelope Encryption Design
 * ─────────────────────────
 * Each confession gets a random 256-bit Data Encryption Key (DEK).
 * The DEK encrypts the confession content (AES-256-GCM).
 * The DEK itself is encrypted ("wrapped") with the current Master Key (KEK).
 *
 * Stored per confession:
 *   encryptedContent   – AES-256-GCM ciphertext  (iv + authTag + ciphertext)
 *   wrappedDek         – AES-256-GCM wrapped DEK  (iv + authTag + encryptedDek)
 *   keyVersion         – which master key version wrapped this DEK
 *
 * Key Rotation:
 *   Only wrappedDek needs to be re-wrapped; encryptedContent is untouched.
 *   This is O(n) small operations instead of O(n × content_size).
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV recommended for GCM
const KEY_BYTES = 32; // 256-bit

export interface EnvelopePayload {
  encryptedContent: string; // base64: iv(12) + authTag(16) + ciphertext
  wrappedDek: string; // base64: iv(12) + authTag(16) + encryptedDek(32)
  keyVersion: string; // e.g. "v1", "v2"
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);

  /**
   * Returns a Map of version → Buffer for all configured master keys.
   * Environment variables:
   *   ENCRYPTION_MASTER_KEY_v1=<hex-64-chars>
   *   ENCRYPTION_MASTER_KEY_v2=<hex-64-chars>
   *   ENCRYPTION_CURRENT_KEY_VERSION=v2
   */
  private masterKeys: Map<string, Buffer>;
  private currentVersion: string;

  constructor(private readonly config: ConfigService) {
    this.masterKeys = new Map();
    this.currentVersion = this.config.getOrThrow<string>(
      'ENCRYPTION_CURRENT_KEY_VERSION',
    );

    // Load all versioned keys from env
    // Keys are named ENCRYPTION_MASTER_KEY_v1, ENCRYPTION_MASTER_KEY_v2, etc.
    let version = 1;
    while (true) {
      const versionTag = `v${version}`;
      const raw = this.config.get<string>(
        `ENCRYPTION_MASTER_KEY_${versionTag}`,
      );
      if (!raw) break;
      const keyBuf = Buffer.from(raw, 'hex');
      if (keyBuf.length !== KEY_BYTES) {
        throw new Error(
          `Master key ${versionTag} must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars)`,
        );
      }
      this.masterKeys.set(versionTag, keyBuf);
      version++;
    }

    if (this.masterKeys.size === 0) {
      throw new Error('No ENCRYPTION_MASTER_KEY_* env variables configured');
    }
    if (!this.masterKeys.has(this.currentVersion)) {
      throw new Error(
        `Current key version ${this.currentVersion} not found in configured keys`,
      );
    }

    this.logger.log(
      `Envelope encryption ready. Versions: [${[...this.masterKeys.keys()].join(', ')}]. Active: ${this.currentVersion}`,
    );
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Encrypt plaintext using envelope encryption.
   * Returns structured payload ready to persist.
   */
  encrypt(plaintext: string): EnvelopePayload {
    const dek = crypto.randomBytes(KEY_BYTES);
    const encryptedContent = this.aesgcmEncrypt(dek, Buffer.from(plaintext, 'utf8'));
    const masterKey = this.masterKeys.get(this.currentVersion)!;
    const wrappedDek = this.aesgcmEncrypt(masterKey, dek);

    return {
      encryptedContent: encryptedContent.toString('base64'),
      wrappedDek: wrappedDek.toString('base64'),
      keyVersion: this.currentVersion,
    };
  }

  /**
   * Decrypt a confession using the appropriate master key version.
   */
  decrypt(payload: EnvelopePayload): string {
    const masterKey = this.masterKeys.get(payload.keyVersion);
    if (!masterKey) {
      throw new InternalServerErrorException(
        `Unknown key version: ${payload.keyVersion}`,
      );
    }

    const dek = this.aesgcmDecrypt(
      masterKey,
      Buffer.from(payload.wrappedDek, 'base64'),
    );
    const plaintext = this.aesgcmDecrypt(
      dek,
      Buffer.from(payload.encryptedContent, 'base64'),
    );

    return plaintext.toString('utf8');
  }

  /**
   * Re-wrap a DEK from any old master key version to the current master key.
   * The confession ciphertext (encryptedContent) is NOT touched — only wrappedDek
   * and keyVersion change. This is the core of cheap key rotation.
   */
  rewrapDek(payload: EnvelopePayload): EnvelopePayload {
    if (payload.keyVersion === this.currentVersion) {
      return payload; // already on current version, nothing to do
    }

    const oldMasterKey = this.masterKeys.get(payload.keyVersion);
    if (!oldMasterKey) {
      throw new InternalServerErrorException(
        `Cannot rewrap: unknown source key version ${payload.keyVersion}`,
      );
    }

    // Unwrap DEK with old master key
    const dek = this.aesgcmDecrypt(
      oldMasterKey,
      Buffer.from(payload.wrappedDek, 'base64'),
    );

    // Re-wrap with current master key
    const newMasterKey = this.masterKeys.get(this.currentVersion)!;
    const newWrappedDek = this.aesgcmEncrypt(newMasterKey, dek);

    return {
      encryptedContent: payload.encryptedContent, // unchanged
      wrappedDek: newWrappedDek.toString('base64'),
      keyVersion: this.currentVersion,
    };
  }

  /**
   * Legacy decrypt for confessions still using the old static-key scheme
   * (CONFESSION_ENCRYPTION_KEY). Used only during migration.
   *
   * Expected legacy format: base64(iv[16] + encrypted) using AES-256-CBC.
   * Adjust if the actual legacy scheme differs.
   */
  decryptLegacy(legacyCiphertext: string): string {
    const legacyKey = this.config.get<string>('CONFESSION_ENCRYPTION_KEY');
    if (!legacyKey) {
      throw new InternalServerErrorException(
        'CONFESSION_ENCRYPTION_KEY not set; cannot decrypt legacy data',
      );
    }
    const keyBuf = Buffer.from(legacyKey, 'hex');
    const raw = Buffer.from(legacyCiphertext, 'base64');
    const iv = raw.subarray(0, 16);
    const ciphertext = raw.subarray(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /** True if keyVersion matches the current active master key. */
  isCurrentVersion(keyVersion: string): boolean {
    return keyVersion === this.currentVersion;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * AES-256-GCM encrypt.
   * Output: iv(12) + authTag(16) + ciphertext — all concatenated.
   */
  private aesgcmEncrypt(key: Buffer, plaintext: Buffer): Buffer {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * AES-256-GCM decrypt.
   * Input: iv(12) + authTag(16) + ciphertext
   */
  private aesgcmDecrypt(key: Buffer, data: Buffer): Buffer {
    const iv = data.subarray(0, IV_BYTES);
    const authTag = data.subarray(IV_BYTES, IV_BYTES + 16);
    const ciphertext = data.subarray(IV_BYTES + 16);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}