import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { EncryptionService, EnvelopePayload } from './encryption.service';

const V1_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const V2_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

function buildMockConfig(keys: Record<string, string>, current: string) {
  const get = (key: string) => {
    if (key === 'ENCRYPTION_CURRENT_KEY_VERSION') return current;
    const m = key.match(/^ENCRYPTION_MASTER_KEY_(v\d+)$/);
    return m ? keys[m[1]] : undefined;
  };
  return {
    get: jest.fn().mockImplementation(get),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      const v = get(key);
      if (v === undefined) throw new Error(`Missing: ${key}`);
      return v;
    }),
  };
}

async function buildService(keys: Record<string, string>, current = 'v1') {
  const mock = buildMockConfig(keys, current);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      EncryptionService,
      { provide: ConfigService, useValue: mock },
    ],
  }).compile();
  return module.get<EncryptionService>(EncryptionService);
}

describe('EncryptionService', () => {
  let service: EncryptionService;
  const validMasterKey = V1_KEY;

  const mockConfigService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    mockConfigService.get.mockImplementation((key: string) =>
      key === 'ENCRYPTION_MASTER_KEY_v1' ? validMasterKey : undefined,
    );
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'ENCRYPTION_CURRENT_KEY_VERSION') return 'v1';
      throw new Error(`Missing configuration value: ${key}`);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should encrypt and decrypt text correctly', () => {
    const text = 'sensitive@email.com';
    const encrypted = service.encrypt(text);
    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it('should return empty string for empty input', () => {
    const encrypted = service.encrypt('');
    expect(service.decrypt(encrypted)).toBe('');
  });

  it('should produce different ciphertexts for same input', () => {
    const text = 'test@example.com';
    const encrypted1 = service.encrypt(text);
    const encrypted2 = service.encrypt(text);
    expect(encrypted1.encryptedContent).not.toBe(encrypted2.encryptedContent);
    expect(encrypted1.wrappedDek).not.toBe(encrypted2.wrappedDek);
  });

  it('should throw error for invalid encrypted format', () => {
    expect(() =>
      service.decrypt({
        encryptedContent: 'invalid-format',
        wrappedDek: 'invalid-format',
        keyVersion: 'v1',
      }),
    ).toThrow();
  });

  it('should reject ciphertext values with invalid payload shape', () => {
    expect(() =>
      service.decrypt({
        encryptedContent: '',
        wrappedDek: '',
        keyVersion: 'unknown',
      }),
    ).toThrow('Unknown key version: unknown');
  });

  it('should throw for malformed ciphertext parts with valid shape', () => {
    expect(() =>
      service.decrypt({
        encryptedContent: Buffer.from('too-short').toString('base64'),
        wrappedDek: Buffer.from('too-short').toString('base64'),
        keyVersion: 'v1',
      }),
    ).toThrow();
  });

  it('should keep an already-current DEK unchanged during rewrap', () => {
    const encrypted = service.encrypt('rotate me');
    expect(service.rewrapDek(encrypted)).toBe(encrypted);
  });

  it('should enforce master key presence at construction time', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    await expect(
      Test.createTestingModule({
        providers: [
          EncryptionService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile(),
    ).rejects.toThrow('No ENCRYPTION_MASTER_KEY_* env variables configured');
  });

  it('should enforce master key size at construction time', async () => {
    mockConfigService.get.mockImplementation((key: string) =>
      key === 'ENCRYPTION_MASTER_KEY_v1' ? '001122' : undefined,
    );

    await expect(
      Test.createTestingModule({
        providers: [
          EncryptionService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile(),
    ).rejects.toThrow('Master key v1 must be 32 bytes (64 hex chars)');
  });

  // ─── Large payload ─────────────────────────────────────────────────────────

  describe('large payload', () => {
    it('encrypts and decrypts a 512 KB payload', () => {
      const large = 'A'.repeat(512 * 1024);
      const payload = service.encrypt(large);
      expect(service.decrypt(payload)).toBe(large);
    });

    it('encrypts and decrypts multi-byte Unicode text', () => {
      const text = '🔐 こんにちは ñoño 日本語テスト';
      expect(service.decrypt(service.encrypt(text))).toBe(text);
    });
  });

  // ─── Auth-tag tampering ────────────────────────────────────────────────────

  describe('tampered payloads', () => {
    it('throws when a single byte in the auth tag is flipped', () => {
      const payload = service.encrypt('integrity check');
      const raw = Buffer.from(payload.encryptedContent, 'base64');
      raw[14] ^= 0xff; // byte inside the 16-byte auth tag (offset 12–27)
      const tampered: EnvelopePayload = {
        ...payload,
        encryptedContent: raw.toString('base64'),
      };
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('throws when the nonce (IV) is modified', () => {
      const payload = service.encrypt('nonce test');
      const raw = Buffer.from(payload.encryptedContent, 'base64');
      raw[3] ^= 0x01; // byte inside the 12-byte IV prefix
      expect(() =>
        service.decrypt({ ...payload, encryptedContent: raw.toString('base64') }),
      ).toThrow();
    });

    it('throws when a byte in the ciphertext body is flipped', () => {
      const payload = service.encrypt('body tamper test - long enough to have body bytes');
      const raw = Buffer.from(payload.encryptedContent, 'base64');
      const ciphertextStart = 12 + 16; // IV + authTag
      if (raw.length > ciphertextStart) {
        raw[ciphertextStart] ^= 0x01;
      }
      expect(() =>
        service.decrypt({ ...payload, encryptedContent: raw.toString('base64') }),
      ).toThrow();
    });

    it('throws when the wrapped DEK is corrupted', () => {
      const payload = service.encrypt('dek integrity');
      const raw = Buffer.from(payload.wrappedDek, 'base64');
      raw[15] ^= 0xff;
      expect(() =>
        service.decrypt({ ...payload, wrappedDek: raw.toString('base64') }),
      ).toThrow();
    });
  });

  // ─── Key rotation ──────────────────────────────────────────────────────────

  describe('key rotation (rewrapDek)', () => {
    it('rewraps from v1 to v2 and decrypts successfully with new service', async () => {
      const svcV1 = await buildService({ v1: V1_KEY }, 'v1');
      const plaintext = 'rotate across versions';
      const original = svcV1.encrypt(plaintext);
      expect(original.keyVersion).toBe('v1');

      const svcV2 = await buildService({ v1: V1_KEY, v2: V2_KEY }, 'v2');
      const rotated = svcV2.rewrapDek(original);

      expect(rotated.keyVersion).toBe('v2');
      expect(rotated.encryptedContent).toBe(original.encryptedContent);
      expect(rotated.wrappedDek).not.toBe(original.wrappedDek);
      expect(svcV2.decrypt(rotated)).toBe(plaintext);
    });

    it('rewrapped payload cannot be decrypted by old service (wrong master key)', async () => {
      const svcV1 = await buildService({ v1: V1_KEY }, 'v1');
      const original = svcV1.encrypt('old version only');

      const svcV2 = await buildService({ v1: V1_KEY, v2: V2_KEY }, 'v2');
      const rotated = svcV2.rewrapDek(original);

      // Old service (v1-only) does not know v2 → should throw
      expect(() => svcV1.decrypt(rotated)).toThrow(InternalServerErrorException);
    });

    it('throws when rewrapping from an unknown source version', async () => {
      const svc = await buildService({ v1: V1_KEY, v2: V2_KEY }, 'v2');
      const stale: EnvelopePayload = {
        encryptedContent: Buffer.from('x'.repeat(60)).toString('base64'),
        wrappedDek: Buffer.from('x'.repeat(60)).toString('base64'),
        keyVersion: 'v99',
      };
      expect(() => svc.rewrapDek(stale)).toThrow(InternalServerErrorException);
    });

    it('isCurrentVersion returns true only for active key', async () => {
      const svc = await buildService({ v1: V1_KEY, v2: V2_KEY }, 'v2');
      expect(svc.isCurrentVersion('v2')).toBe(true);
      expect(svc.isCurrentVersion('v1')).toBe(false);
    });
  });

  // ─── Constructor validation ────────────────────────────────────────────────

  describe('constructor validation', () => {
    it('throws when current version is not among the configured keys', async () => {
      await expect(buildService({ v1: V1_KEY }, 'v2')).rejects.toThrow(
        /not found in configured keys/,
      );
    });
  });
});
