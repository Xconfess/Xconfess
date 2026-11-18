import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService, EnvelopePayload } from '../../encryption/encryption.service';
import { envValidationSchema } from '../../config/env.validation';
import { redactLogPayload } from '../logging/log-redaction';

describe('Leaked Secrets Incident Response & Rotation Invariants (#2227)', () => {
  describe('Session Invalidation Invariant (JWT_SECRET Rotation)', () => {
    const oldSecret = 'old-leaked-jwt-secret-at-least-32-chars-long';
    const newSecret = 'new-rotated-jwt-secret-at-least-32-chars-long';

    it('immediately invalidates existing tokens when JWT_SECRET is rotated', () => {
      const userPayload = { sub: 42, username: 'testuser', role: 'user' };

      // Token minted under compromised oldSecret
      const compromisedToken = jwt.sign(userPayload, oldSecret, { expiresIn: '1h' });

      // Verification under oldSecret succeeds
      const decodedOld = jwt.verify(compromisedToken, oldSecret) as typeof userPayload;
      expect(decodedOld.sub).toBe(42);

      // Verification under newSecret immediately fails with invalid signature
      expect(() => {
        jwt.verify(compromisedToken, newSecret);
      }).toThrow(/invalid signature/);

      // Fresh token minted with newSecret validates successfully
      const freshToken = jwt.sign(userPayload, newSecret, { expiresIn: '1h' });
      const decodedNew = jwt.verify(freshToken, newSecret) as typeof userPayload;
      expect(decodedNew.sub).toBe(42);
    });
  });

  describe('Zero-Downtime Envelope Key Rotation (ENCRYPTION_MASTER_KEY_v*)', () => {
    const v1KeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const v2KeyHex = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    let serviceV1: EncryptionService;
    let serviceV2: EncryptionService;

    beforeEach(async () => {
      // Configuration for service operating on v1
      const configV1 = {
        get: jest.fn((k: string) => {
          if (k === 'ENCRYPTION_MASTER_KEY_v1') return v1KeyHex;
          return undefined;
        }),
        getOrThrow: jest.fn((k: string) => {
          if (k === 'ENCRYPTION_CURRENT_KEY_VERSION') return 'v1';
          throw new Error(`Missing ${k}`);
        }),
      };

      const moduleV1: TestingModule = await Test.createTestingModule({
        providers: [EncryptionService, { provide: ConfigService, useValue: configV1 }],
      }).compile();
      serviceV1 = moduleV1.get<EncryptionService>(EncryptionService);

      // Configuration during rotation: supports both v1 and v2, active version is v2
      const configV2 = {
        get: jest.fn((k: string) => {
          if (k === 'ENCRYPTION_MASTER_KEY_v1') return v1KeyHex;
          if (k === 'ENCRYPTION_MASTER_KEY_v2') return v2KeyHex;
          return undefined;
        }),
        getOrThrow: jest.fn((k: string) => {
          if (k === 'ENCRYPTION_CURRENT_KEY_VERSION') return 'v2';
          throw new Error(`Missing ${k}`);
        }),
      };

      const moduleV2: TestingModule = await Test.createTestingModule({
        providers: [EncryptionService, { provide: ConfigService, useValue: configV2 }],
      }).compile();
      serviceV2 = moduleV2.get<EncryptionService>(EncryptionService);
    });

    it('rewraps DEK to new master key version without touching confession ciphertext', () => {
      const plaintext = 'Sensitive confession submitted prior to key leak.';

      // Confession encrypted under v1
      const payloadV1: EnvelopePayload = serviceV1.encrypt(plaintext);
      expect(payloadV1.keyVersion).toBe('v1');

      // Decrypting with v1 works
      expect(serviceV1.decrypt(payloadV1)).toBe(plaintext);

      // Service with active v2 rewraps DEK
      const payloadV2: EnvelopePayload = serviceV2.rewrapDek(payloadV1);

      // Core rotation assertions:
      expect(payloadV2.keyVersion).toBe('v2');
      // Content ciphertext is unchanged (O(1) rewrap, no content re-encryption)
      expect(payloadV2.encryptedContent).toBe(payloadV1.encryptedContent);
      // Wrapped DEK is re-encrypted with new master key
      expect(payloadV2.wrappedDek).not.toBe(payloadV1.wrappedDek);

      // Decrypting rewrapped payload with serviceV2 succeeds
      expect(serviceV2.decrypt(payloadV2)).toBe(plaintext);
    });

    it('keeps already current keyVersion unchanged during rewrap check', () => {
      const payloadV2 = serviceV2.encrypt('Fresh confession encrypted under v2');
      const unchanged = serviceV2.rewrapDek(payloadV2);
      expect(unchanged).toBe(payloadV2);
    });
  });

  describe('Environment Validation Schema Constraints on Rotated Secrets', () => {
    const validBaseConfig = {
      NODE_ENV: 'production',
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'secure-database-password-1234',
      DB_NAME: 'xconfess',
      APP_SECRET: 'production-app-secret-with-minimum-32-chars-long',
      JWT_SECRET: 'production-jwt-secret-with-minimum-32-chars-long',
      CONFESSION_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ENCRYPTION_MASTER_KEY_v1:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ENCRYPTION_CURRENT_KEY_VERSION: 'v1',
    };

    it('rejects short JWT_SECRET during rotation', () => {
      const invalidConfig = {
        ...validBaseConfig,
        JWT_SECRET: 'too-short',
      };
      const { error } = envValidationSchema.validate(invalidConfig);
      expect(error).toBeDefined();
      expect(error?.message).toContain('JWT_SECRET must be at least 32 characters long');
    });

    it('rejects all-zero placeholder for replacement encryption keys', () => {
      const invalidConfig = {
        ...validBaseConfig,
        CONFESSION_ENCRYPTION_KEY:
          '0000000000000000000000000000000000000000000000000000000000000000',
      };
      const { error } = envValidationSchema.validate(invalidConfig);
      expect(error).toBeDefined();
      expect(error?.message).toContain(
        'CONFESSION_ENCRYPTION_KEY cannot be the all-zero development placeholder',
      );
    });

    it('rejects non-hex or invalid length encryption keys', () => {
      const invalidLengthConfig = {
        ...validBaseConfig,
        ENCRYPTION_MASTER_KEY_v1: 'deadbeef', // not 64 chars
      };
      const { error } = envValidationSchema.validate(invalidLengthConfig);
      expect(error).toBeDefined();
      expect(error?.message).toContain('ENCRYPTION_MASTER_KEY_v1 must be exactly 64 characters');
    });

    it('validates Stellar secret seed format when Stellar features are enabled', () => {
      const invalidStellarConfig = {
        ...validBaseConfig,
        STELLAR_FEATURES_ENABLED: 'true',
        CONFESSION_ANCHOR_CONTRACT_ID: 'CB5XMDHT66EISB4WXM4YGNDHYRMZDX42TOHZEAENIUTSSMRFHJSFRNHB',
        REPUTATION_BADGES_CONTRACT_ID: 'CDAN4HZHY6XNQR3TRPLPJKVKNURVMMQMF7XNZ6AUNJNFLR77J4DNAEYI',
        TIPPING_SYSTEM_CONTRACT_ID: 'CC74UWNAAYDTPEPVKR4CPANWJSF6GI2PCI7BLN6M46KB6CSQYVYLHIWM',
        STELLAR_SERVER_SECRET: 'GINVALIDSTELLARPUBLICKEYNOTASEED12345678901234567890123456',
      };
      const { error } = envValidationSchema.validate(invalidStellarConfig);
      expect(error).toBeDefined();
      expect(error?.message).toContain('STELLAR_SERVER_SECRET must be a valid Stellar secret seed starting with S');
    });
  });

  describe('Diagnostic Log Redaction for Rotated Secrets', () => {
    it('redacts newly generated secret keys and tokens from log outputs', () => {
      const rotatedStellarSeed = `S${'B'.repeat(55)}`;
      const rotatedJwt = jwt.sign({ sub: 100 }, 'a'.repeat(32));
      const rotatedMasterKey = randomBytes(32).toString('hex');

      const logRecord = {
        requestId: 'incident-rot-001',
        route: '/admin/key-rotation/rotate',
        status: 200,
        rotatedSeed: rotatedStellarSeed,
        jwtToken: rotatedJwt,
        newKey: rotatedMasterKey,
        safeMetric: 'rotation_completed',
      };

      const redacted = redactLogPayload(logRecord);

      expect(redacted.requestId).toBe('incident-rot-001');
      expect(redacted.route).toBe('/admin/key-rotation/rotate');
      expect(redacted.status).toBe(200);
      expect(redacted.safeMetric).toBe('rotation_completed');

      // Value & key redaction assertions:
      expect(redacted.jwtToken).toBe('[REDACTED]');
      expect(redacted.newKey).toContain('...REDACTED');
    });
  });
});
