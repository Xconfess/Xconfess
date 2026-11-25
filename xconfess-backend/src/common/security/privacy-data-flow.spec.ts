import { createHmac, randomBytes } from 'crypto';
import {
  assertEncryptedBeforeSave,
  isEncryptedConfession,
} from '../../utils/confession-encryption';
import { redactLogPayload } from '../logging/log-redaction';
import { AuditLogRedactionService } from '../../audit-log/audit-log-redaction.service';
import {
  buildThreadId,
  parseEnvelope,
  serializeEnvelope,
  MESSAGE_E2E_VERSION,
} from '../../messages/crypto/message-e2e.crypto';

describe('Privacy Data-Flow Regression Invariants (#2226)', () => {
  describe('Confession Content Protection Boundary', () => {
    it('isEncryptedConfession rejects plaintext messages', () => {
      expect(isEncryptedConfession('This is an anonymous confession.')).toBe(false);
      expect(isEncryptedConfession('')).toBe(false);
      expect(isEncryptedConfession('{"message":"hello"}')).toBe(false);
      expect(isEncryptedConfession('1234567890abcdef')).toBe(false);
    });

    it('isEncryptedConfession rejects malformed or short IV ciphertext', () => {
      // Valid IV length is 16 bytes = 32 hex chars
      const shortIv = 'abcdef123456:deadbeef';
      expect(isEncryptedConfession(shortIv)).toBe(false);

      const nonHexIv = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:deadbeef';
      expect(isEncryptedConfession(nonHexIv)).toBe(false);

      const missingCipher = '0123456789abcdef0123456789abcdef:';
      expect(isEncryptedConfession(missingCipher)).toBe(false);
    });

    it('isEncryptedConfession accepts valid ivHex:cipherHex strings', () => {
      const validIv = randomBytes(16).toString('hex');
      const validCipher = randomBytes(32).toString('hex');
      const encryptedConfession = `${validIv}:${validCipher}`;

      expect(isEncryptedConfession(encryptedConfession)).toBe(true);
    });

    it('assertEncryptedBeforeSave prevents plaintext from reaching database persistence', () => {
      const plaintext = 'Sensitive confession that should never be stored raw.';
      expect(() => assertEncryptedBeforeSave(plaintext)).toThrow(
        /Security Invariant Violation: Confession content must be encrypted before persistence/,
      );

      const validEncrypted = `${randomBytes(16).toString('hex')}:${randomBytes(24).toString('hex')}`;
      expect(() => assertEncryptedBeforeSave(validEncrypted)).not.toThrow();
    });
  });

  describe('Log Redaction & Diagnostics Boundary', () => {
    it('redacts sensitive fields and tokens while preserving operational fields', () => {
      const logPayload = {
        requestId: 'req-uuid-1234',
        route: '/confessions/:id',
        status: 200,
        userId: 'user_a1b2c3d4e5f6',
        password: 'super-secret-password',
        secret: 'app-secret-123',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
        encryptedPayload: 'some-encrypted-data',
        ciphertext: 'iv:cipher',
      };

      const redacted = redactLogPayload(logPayload);

      // Operational fields are preserved
      expect(redacted.requestId).toBe('req-uuid-1234');
      expect(redacted.route).toBe('/confessions/:id');
      expect(redacted.status).toBe(200);
      expect(redacted.userId).toBe('user_a1b2c3d4e5f6');

      // Sensitive fields are redacted
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.secret).toBe('[REDACTED]');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.encryptedPayload).toBe('[REDACTED]');
      expect(redacted.ciphertext).toBe('[REDACTED]');
    });

    it('redacts JWT patterns in non-sensitive field names', () => {
      const jwtValue =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozG4B1sWi_yF_m_n4WqTfA';
      const payload = {
        customParam: jwtValue,
        safeLabel: 'confession-feed',
      };

      const redacted = redactLogPayload(payload);
      expect(redacted.customParam).toBe('[REDACTED]');
      expect(redacted.safeLabel).toBe('confession-feed');
    });

    it('does not mutate input payload', () => {
      const original = { secret: 'do-not-change-in-place', code: 404 };
      const originalCopy = { ...original };
      redactLogPayload(original);
      expect(original).toEqual(originalCopy);
    });
  });

  describe('Audit Log Redaction Boundary', () => {
    let auditRedactionService: AuditLogRedactionService;

    beforeEach(() => {
      auditRedactionService = new AuditLogRedactionService();
    });

    it('redacts sensitive fields from audit metadata while preserving operational fields', () => {
      const metadata = {
        action: 'UPDATE_CONFESSION',
        confessionId: 'conf-123',
        encryptedContent: 'iv:cipher',
        accessToken: 'token-abc',
        privateKey: 'key-123',
        entityId: 'e-999',
      };

      const redacted = auditRedactionService.redactMetadata(metadata);

      expect(redacted?.action).toBe('UPDATE_CONFESSION');
      expect(redacted?.confessionId).toBe('conf-123');
      expect(redacted?.entityId).toBe('e-999');

      expect(redacted?.encryptedContent).toBe('[REDACTED]');
      expect(redacted?.accessToken).toBe('[REDACTED]');
      expect(redacted?.privateKey).toBe('[REDACTED]');
    });

    it('masks email addresses properly to prevent PII leakage in audit logs', () => {
      expect(auditRedactionService.maskEmail('user@example.com')).toBe('us***@example.com');
      expect(auditRedactionService.maskEmail('al@domain.org')).toBe('*@domain.org');
      expect(auditRedactionService.maskEmail('invalid-email')).toBe('[REDACTED_EMAIL]');
    });

    it('masks user IDs using deterministic hash prefixes', () => {
      const masked1 = auditRedactionService.maskUserId(42);
      const masked2 = auditRedactionService.maskUserId(42);
      const maskedOther = auditRedactionService.maskUserId(43);

      expect(masked1).toMatch(/^user_[0-9a-f]{12}$/);
      expect(masked1).toBe(masked2);
      expect(masked1).not.toBe(maskedOther);
    });
  });

  describe('End-to-End Direct Message Boundary', () => {
    it('parseEnvelope rejects plaintext messages', () => {
      expect(parseEnvelope('Hello Alice, this is a secret message')).toBeNull();
      expect(parseEnvelope('{"content":"plaintext message"}')).toBeNull();
    });

    it('parseEnvelope validates strict envelope shape and rejects extra fields', () => {
      const validIv = Buffer.from(randomBytes(12)).toString('base64url');
      const validCt = Buffer.from(randomBytes(32)).toString('base64url');

      const validEnvelope = {
        v: MESSAGE_E2E_VERSION,
        alg: 'aes-256-gcm' as const,
        iv: validIv,
        ct: validCt,
      };

      const serialized = serializeEnvelope(validEnvelope);
      const parsed = parseEnvelope(serialized);
      expect(parsed).toEqual(validEnvelope);

      // Rejects payload with extra unexpected keys (shape smuggling prevention)
      const smuggled = JSON.stringify({
        ...validEnvelope,
        extraPlaintext: 'sneaky message leak',
      });
      expect(parseEnvelope(smuggled)).toBeNull();
    });

    it('parseEnvelope rejects incorrect algorithms or invalid nonce lengths', () => {
      const validCt = Buffer.from(randomBytes(32)).toString('base64url');

      // Wrong algorithm
      const wrongAlg = JSON.stringify({
        v: 1,
        alg: 'aes-256-cbc',
        iv: Buffer.from(randomBytes(16)).toString('base64url'),
        ct: validCt,
      });
      expect(parseEnvelope(wrongAlg)).toBeNull();

      // Wrong nonce length (e.g. 16 bytes instead of 12 for GCM)
      const wrongNonce = JSON.stringify({
        v: 1,
        alg: 'aes-256-gcm',
        iv: Buffer.from(randomBytes(16)).toString('base64url'),
        ct: validCt,
      });
      expect(parseEnvelope(wrongNonce)).toBeNull();
    });

    it('buildThreadId creates standard deterministic composite thread identifier', () => {
      const confessionId = 'c0ffee00-1111-2222-3333-444455556666';
      const senderAnonId = 'a1b2c3d4-aaaa-bbbb-cccc-ddddeeeeffff';

      const threadId = buildThreadId(confessionId, senderAnonId);
      expect(threadId).toBe(`${confessionId}:${senderAnonId}`);
    });
  });

  describe('Stellar Boundary & Wallet Fingerprint Invariant', () => {
    it('produces 64-character hex HMAC-SHA256 fingerprint for Stellar address', () => {
      const stellarAddress = 'GBZXN7PIRZGNMHGA728R4EU25IOV4J2VRM25QSLQN5Y2NZS262D6OBVY';
      const appSecret = 'mock-app-secret-for-privacy-verification';

      const fingerprint = createHmac('sha256', appSecret)
        .update(stellarAddress)
        .digest('hex');

      expect(fingerprint).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(fingerprint)).toBe(true);

      // Verify that fingerprint is one-way: cannot derive Stellar address from fingerprint
      expect(fingerprint).not.toContain('GBZXN');
    });
  });
});
