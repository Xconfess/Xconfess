import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const validMasterKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
});
