import { AuditLogRedactionService } from './audit-log-redaction.service';

describe('AuditLogRedactionService', () => {
  let service: AuditLogRedactionService;

  beforeEach(() => {
    service = new AuditLogRedactionService();
  });

  describe('sensitive field list documentation', () => {
    it('exposes the documented set of sensitive exact field names', () => {
      const fields = AuditLogRedactionService.getSensitiveFields();
      expect(fields).toBeInstanceOf(Set);
      expect(fields.size).toBeGreaterThan(0);

      const sensitiveFields = Array.from(fields);
      expect(sensitiveFields).toContain('token');
      expect(sensitiveFields).toContain('accessToken');
      expect(sensitiveFields).toContain('refreshToken');
      expect(sensitiveFields).toContain('password');
      expect(sensitiveFields).toContain('passwordHash');
      expect(sensitiveFields).toContain('secret');
      expect(sensitiveFields).toContain('apiSecret');
      expect(sensitiveFields).toContain('privateKey');
      expect(sensitiveFields).toContain('apiKey');
      expect(sensitiveFields).toContain('encryptedPayload');
      expect(sensitiveFields).toContain('signature');
      expect(sensitiveFields).toContain('bearerToken');
      expect(sensitiveFields).toContain('authorization');
    });

    it('exposes the documented sensitive name patterns', () => {
      const patterns = AuditLogRedactionService.getSensitivePatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('isSensitiveField', () => {
    it('identifies exact-match sensitive fields', () => {
      expect(service.isSensitiveField('token')).toBe(true);
      expect(service.isSensitiveField('password')).toBe(true);
      expect(service.isSensitiveField('secret')).toBe(true);
      expect(service.isSensitiveField('privateKey')).toBe(true);
      expect(service.isSensitiveField('encryptedPayload')).toBe(true);
      expect(service.isSensitiveField('signature')).toBe(true);
      expect(service.isSensitiveField('bearerToken')).toBe(true);
    });

    it('identifies fields matching sensitive patterns', () => {
      expect(service.isSensitiveField('my_secret_key')).toBe(true);
      expect(service.isSensitiveField('hashed_password')).toBe(true);
      expect(service.isSensitiveField('user_credential')).toBe(true);
      expect(service.isSensitiveField('auth_token')).toBe(true);
    });

    it('does NOT flag useful audit fields as sensitive', () => {
      expect(service.isSensitiveField('entityType')).toBe(false);
      expect(service.isSensitiveField('entityId')).toBe(false);
      expect(service.isSensitiveField('confessionId')).toBe(false);
      expect(service.isSensitiveField('commentId')).toBe(false);
      expect(service.isSensitiveField('reportId')).toBe(false);
      expect(service.isSensitiveField('actorType')).toBe(false);
      expect(service.isSensitiveField('actorId')).toBe(false);
      expect(service.isSensitiveField('templateKey')).toBe(false);
      expect(service.isSensitiveField('templateVersion')).toBe(false);
      expect(service.isSensitiveField('changeType')).toBe(false);
      expect(service.isSensitiveField('reason')).toBe(false);
      expect(service.isSensitiveField('flags')).toBe(false);
      expect(service.isSensitiveField('score')).toBe(false);
      expect(service.isSensitiveField('summary')).toBe(false);
      expect(service.isSensitiveField('before')).toBe(false);
      expect(service.isSensitiveField('after')).toBe(false);
      expect(service.isSensitiveField('diff')).toBe(false);
      expect(service.isSensitiveField('outcome')).toBe(false);
      expect(service.isSensitiveField('requestId')).toBe(false);
      expect(service.isSensitiveField('correlationId')).toBe(false);
      expect(service.isSensitiveField('exportId')).toBe(false);
    });
  });

  describe('redactMetadata', () => {
    it('returns null for null/undefined input', () => {
      expect(service.redactMetadata(null)).toBeNull();
      expect(service.redactMetadata(undefined)).toBeNull();
    });

    it('redacts tokens from metadata', () => {
      const result = service.redactMetadata({
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmX',
        userId: '42',
      });

      expect(result).toBeDefined();
      expect(result!.accessToken).toBe('[REDACTED]');
    });

    it('redacts passwords from metadata', () => {
      const result = service.redactMetadata({
        password: 'super_secret_123',
        newPassword: 'even_more_secret',
        notes: 'user changed password',
      });

      expect(result).toBeDefined();
      expect(result!.password).toBe('[REDACTED]');
      expect(result!.newPassword).toBe('[REDACTED]');
      expect(result!.notes).toBe('user changed password');
    });

    it('redacts secrets and keys from metadata', () => {
      const result = service.redactMetadata({
        apiSecret: 'sk_live_abc123def456',
        apiKey: 'key_1234567890abcdef',
        privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----',
        entityType: 'confession',
      });

      expect(result).toBeDefined();
      expect(result!.apiSecret).toBe('[REDACTED]');
      expect(result!.apiKey).toBe('[REDACTED]');
      expect(result!.privateKey).toBe('[REDACTED]');
      expect(result!.entityType).toBe('confession');
    });

    it('redacts encrypted payloads', () => {
      const result = service.redactMetadata({
        encryptedPayload: 'a4f9c2...',
        encryptedData: 'b3e8d1...',
        ciphertext: '0123456789abcdef',
        rawEncrypted: 'base64encodedstuff==',
        confessionId: 'abc-123',
      });

      expect(result).toBeDefined();
      expect(result!.encryptedPayload).toBe('[REDACTED]');
      expect(result!.encryptedData).toBe('[REDACTED]');
      expect(result!.ciphertext).toBe('[REDACTED]');
      expect(result!.rawEncrypted).toBe('[REDACTED]');
      expect(result!.confessionId).toBe('abc-123');
    });

    it('redacts sensitive moderator/admin action metadata with stable markers', () => {
      const result = service.redactMetadata({
        actorType: 'admin',
        actorEmail: 'moderator@example.com',
        sessionMetadata:
          'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiNDIiLCJpYXQiOjE2Mjk5OTk5OTl9.bFfKxwRJSMeKaF2QT4fwpMeJf36POk6yJV_adQssw5c',
        stellarSecret: 'sk_test_supersecret1234567890',
        comment: 'Reviewer note',
      });

      expect(result).toBeDefined();
      expect(result!.actorEmail).toBe('mo***@example.com');
      expect(result!.sessionMetadata).toContain('xxx.');
      expect(result!.stellarSecret).toBe('[REDACTED]');
      expect(result!.comment).toBe('Reviewer note');
    });

    it('redacts signatures from metadata', () => {
      const result = service.redactMetadata({
        signature: '0xabcd1234deadbeef5678',
        signedMessage: 'I agree to transfer 100 tokens',
        extra: 'metadata',
      });

      expect(result).toBeDefined();
      expect(result!.signature).toBe('[REDACTED]');
      expect(result!.signedMessage).toBe('[REDACTED]');
      expect(result!.extra).toBe('metadata');
    });

    it('redacts JWT tokens detected in values regardless of field name', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const result = service.redactMetadata({
        customHeader: token,
        rawValue: token,
        entityType: 'session',
      });

      expect(result).toBeDefined();
      expect(result!.customHeader).toContain('xxx.');
      expect(result!.rawValue).toContain('xxx.');
      expect(result!.entityType).toBe('session');
    });

    it('masks email addresses in email-related fields', () => {
      const result = service.redactMetadata({
        email: 'john.doe@example.com',
        recipientEmail: 'admin@xconfess.io',
        sender: 'noreply@xconfess.io',
        extra: 'just text',
      });

      expect(result).toBeDefined();
      expect(result!.email).toBe('jo***@example.com');
      expect(result!.recipientEmail).toBe('ad***@xconfess.io');
      expect(result!.sender).toBe('no***@xconfess.io');
      expect(result!.extra).toBe('just text');
    });

    it('preserves non-sensitive fields unchanged', () => {
      const input = {
        entityType: 'confession',
        entityId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        confessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        reportId: 'abc-123',
        commentId: 'def-456',
        actorType: 'admin',
        actorId: '7',
        actorLabel: 'moderator_bob',
        templateKey: 'welcome_email',
        templateVersion: 'v2',
        changeType: 'state_transition',
        reason: 'Violated community guidelines',
        flags: ['spam', 'harassment'],
        score: 0.95,
        outcome: 'success',
        summary: { attempted: 5, replayed: 3, failed: 2 },
        before: { activeVersion: 'v1' },
        after: { activeVersion: 'v2' },
        diff: { activeVersion: { before: 'v1', after: 'v2' } },
        requestId: 'req-123',
        exportId: 'exp-456',
        correlationId: 'corr-789',
      };

      const result = service.redactMetadata(input);

      expect(result).toBeDefined();
      expect(result).toEqual(input);
    });

    describe('nested metadata redaction', () => {
      it('redacts sensitive fields in nested objects', () => {
        const result = service.redactMetadata({
          user: {
            id: 42,
            email: 'user@example.com',
            password: 'should-be-redacted',
            profile: {
              bio: 'just a bio',
              secretKey: 'sk-nested-value',
            },
          },
          request: {
            token: 'abc123def456',
            method: 'POST',
          },
        });

        expect(result).toBeDefined();
        const meta = result!;

        expect((meta.user as any).email).toBe('us***@example.com');
        expect((meta.user as any).password).toBe('[REDACTED]');
        expect((meta.user as any).profile.bio).toBe('just a bio');
        expect((meta.user as any).profile.secretKey).toBe('[REDACTED]');
        expect((meta.request as any).token).toBe('[REDACTED]');
        expect((meta.request as any).method).toBe('POST');
      });

      it('redacts sensitive fields in arrays of objects', () => {
        const result = service.redactMetadata({
          items: [
            { name: 'item1', secret: 's1' },
            { name: 'item2', password: 'p2' },
            { name: 'item3', value: 'v3' },
          ],
        });

        expect(result).toBeDefined();
        const items = result!.items as any[];
        expect(items[0].name).toBe('item1');
        expect(items[0].secret).toBe('[REDACTED]');
        expect(items[1].name).toBe('item2');
        expect(items[1].password).toBe('[REDACTED]');
        expect(items[2].name).toBe('item3');
        expect(items[2].value).toBe('v3');
      });

      it('handles deeply nested structures', () => {
        const result = service.redactMetadata({
          level1: {
            level2: {
              level3: {
                accessToken: 'deeply-nested-token',
                data: 'ok',
              },
            },
          },
        });

        expect(result).toBeDefined();
        const l3 = (result!.level1 as any).level2.level3;
        expect(l3.accessToken).toBe('[REDACTED]');
        expect(l3.data).toBe('ok');
      });

      it('handles empty objects and arrays', () => {
        const result = service.redactMetadata({
          emptyObject: {},
          emptyArray: [],
          nullValue: null,
          zero: 0,
          falseValue: false,
        });

        expect(result).toBeDefined();
        expect((result!.emptyObject as any)).toEqual({});
        expect(result!.emptyArray).toEqual([]);
        expect(result!.nullValue).toBeNull();
        expect(result!.zero).toBe(0);
        expect(result!.falseValue).toBe(false);
      });

      it('redacts sensitive fields in nested arrays of arrays', () => {
        const result = service.redactMetadata({
          matrix: [
            [{ token: 'a' }, { token: 'b' }],
            [{ token: 'c' }, { value: 'd' }],
          ],
        });

        expect(result).toBeDefined();
        const matrix = result!.matrix as any[][];
        expect(matrix[0][0].token).toBe('[REDACTED]');
        expect(matrix[0][1].token).toBe('[REDACTED]');
        expect(matrix[1][0].token).toBe('[REDACTED]');
        expect(matrix[1][1].value).toBe('d');
      });
    });

    describe('masking functions', () => {
      it('maskUserId produces consistent SHA-256 hashes', () => {
        const id1 = service.maskUserId(42);
        const id2 = service.maskUserId(42);
        expect(id1).toBe(id2);
        expect(id1).toMatch(/^user_[a-f0-9]{12}$/);
        expect(id1.length).toBe(17);
      });

      it('maskUserId produces different hashes for different inputs', () => {
        const id1 = service.maskUserId(1);
        const id2 = service.maskUserId(2);
        expect(id1).not.toBe(id2);
      });

      it('maskEmail preserves domain but masks local part', () => {
        expect(service.maskEmail('john@example.com')).toBe('jo***@example.com');
        expect(service.maskEmail('a@b.c')).toBe('*@b.c');
        expect(service.maskEmail('ab@x.io')).toBe('*@x.io');
        expect(service.maskEmail('abc@x.io')).toBe('ab***@x.io');
        expect(service.maskEmail('bad')).toBe('[REDACTED_EMAIL]');
      });

      it('maskJwt replaces header and signature segments', () => {
        const masked = service.maskJwt('header.payload.signature');
        expect(masked).toBe('xxx.header.payload.xxx');
      });

      it('maskLongHex truncates long hex strings', () => {
        expect(
          service.maskLongHex('0123456789abcdef0123456789abcdef01234567'),
        ).toBe('0123...4567');
        expect(service.maskLongHex('abc')).toBe('abc');
      });
    });
  });
});
