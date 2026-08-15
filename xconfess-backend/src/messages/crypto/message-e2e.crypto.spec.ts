import {
  buildThreadId,
  decryptMessage,
  encryptMessage,
  generateMessageKeyPair,
  isEncryptedPayload,
  parseEnvelope,
  unwrapPrivateKeyWithPassphrase,
  wrapPrivateKeyWithPassphrase,
} from './message-e2e.crypto';

describe('Message E2E crypto', () => {
  const confessionId = '11111111-1111-4111-8111-111111111111';
  const senderAnonId = '22222222-2222-4222-8222-222222222222';
  const threadId = buildThreadId(confessionId, senderAnonId);

  it('generates X25519 key pairs', async () => {
    const alice = await generateMessageKeyPair();
    const bob = await generateMessageKeyPair();

    expect(alice.publicKey).toBeTruthy();
    expect(alice.privateKey).toBeTruthy();
    expect(alice.publicKey).not.toEqual(bob.publicKey);
  });

  it('encrypts and decrypts bidirectionally with ECDH thread keys', async () => {
    const sender = await generateMessageKeyPair();
    const author = await generateMessageKeyPair();

    const ciphertext = await encryptMessage(
      'Hello, anonymous author!',
      sender.privateKey,
      author.publicKey,
      threadId,
    );

    expect(isEncryptedPayload(ciphertext)).toBe(true);

    const plaintext = await decryptMessage(
      ciphertext,
      author.privateKey,
      sender.publicKey,
      threadId,
    );

    expect(plaintext).toBe('Hello, anonymous author!');

    const replyCipher = await encryptMessage(
      'Thanks for reaching out.',
      author.privateKey,
      sender.publicKey,
      threadId,
    );

    const replyPlain = await decryptMessage(
      replyCipher,
      sender.privateKey,
      author.publicKey,
      threadId,
    );

    expect(replyPlain).toBe('Thanks for reaching out.');
  });

  it('rejects tampered ciphertext', async () => {
    const sender = await generateMessageKeyPair();
    const author = await generateMessageKeyPair();

    const ciphertext = await encryptMessage(
      'Secret',
      sender.privateKey,
      author.publicKey,
      threadId,
    );

    const envelope = parseEnvelope(ciphertext)!;
    envelope.ct = envelope.ct.slice(0, -2) + 'xx';
    const tampered = JSON.stringify(envelope);

    await expect(
      decryptMessage(tampered, author.privateKey, sender.publicKey, threadId),
    ).rejects.toThrow();
  });

  describe('malformed envelope rejection', () => {
    it('rejects plaintext strings', () => {
      expect(isEncryptedPayload('just a plain message')).toBe(false);
      expect(parseEnvelope('just a plain message')).toBeNull();
    });

    it('rejects a JSON array instead of an envelope object', () => {
      expect(parseEnvelope('[1,2,3]')).toBeNull();
    });

    it('rejects an envelope missing the ciphertext field', () => {
      const envelope = { v: 1, alg: 'aes-256-gcm', iv: 'AAAAAAAAAAAAAAAA' };
      expect(parseEnvelope(JSON.stringify(envelope))).toBeNull();
    });

    it('rejects an envelope with an unexpected extra field', async () => {
      const sender = await generateMessageKeyPair();
      const author = await generateMessageKeyPair();
      const ciphertext = await encryptMessage(
        'Hi',
        sender.privateKey,
        author.publicKey,
        threadId,
      );
      const envelope = { ...JSON.parse(ciphertext), extra: 'unexpected' };
      expect(parseEnvelope(JSON.stringify(envelope))).toBeNull();
    });

    it('rejects an unsupported algorithm', () => {
      const envelope = {
        v: 1,
        alg: 'aes-128-cbc',
        iv: 'AAAAAAAAAAAAAAAA',
        ct: 'AAAAAAAAAAAAAAAAAAAAAAAA',
      };
      expect(parseEnvelope(JSON.stringify(envelope))).toBeNull();
    });

    it('rejects an unsupported protocol version', () => {
      const envelope = {
        v: 2,
        alg: 'aes-256-gcm',
        iv: 'AAAAAAAAAAAAAAAA',
        ct: 'AAAAAAAAAAAAAAAAAAAAAAAA',
      };
      expect(parseEnvelope(JSON.stringify(envelope))).toBeNull();
    });

    it('rejects a nonce with the wrong byte length', () => {
      // 8 bytes instead of the required 12-byte GCM nonce.
      const envelope = {
        v: 1,
        alg: 'aes-256-gcm',
        iv: 'AAAAAAAAAAA',
        ct: 'AAAAAAAAAAAAAAAAAAAAAAAA',
      };
      expect(parseEnvelope(JSON.stringify(envelope))).toBeNull();
    });

    it('rejects ciphertext shorter than the GCM auth tag', () => {
      const envelope = {
        v: 1,
        alg: 'aes-256-gcm',
        iv: 'AAAAAAAAAAAAAAAA',
        ct: 'AAAA',
      };
      expect(parseEnvelope(JSON.stringify(envelope))).toBeNull();
    });

    it('rejects a plaintext-like payload dressed up as an envelope', () => {
      // Right shape and key names, but iv/ct are not valid base64url ciphertext.
      const envelope = {
        v: 1,
        alg: 'aes-256-gcm',
        iv: 'not base64!!',
        ct: 'still not encrypted, just plain text',
      };
      expect(parseEnvelope(JSON.stringify(envelope))).toBeNull();
    });
  });

  describe('replayed envelopes', () => {
    it('validates and decrypts a replayed (resubmitted) envelope identically each time', async () => {
      const sender = await generateMessageKeyPair();
      const author = await generateMessageKeyPair();
      const ciphertext = await encryptMessage(
        'Resend me',
        sender.privateKey,
        author.publicKey,
        threadId,
      );

      // Simulate the same envelope being submitted twice (e.g. client retry).
      expect(isEncryptedPayload(ciphertext)).toBe(true);
      expect(isEncryptedPayload(ciphertext)).toBe(true);

      const first = await decryptMessage(
        ciphertext,
        author.privateKey,
        sender.publicKey,
        threadId,
      );
      const second = await decryptMessage(
        ciphertext,
        author.privateKey,
        sender.publicKey,
        threadId,
      );
      expect(first).toBe('Resend me');
      expect(second).toBe('Resend me');
    });

    it('rejects a valid envelope replayed against a different thread', async () => {
      const sender = await generateMessageKeyPair();
      const author = await generateMessageKeyPair();
      const ciphertext = await encryptMessage(
        'Bound to original thread',
        sender.privateKey,
        author.publicKey,
        threadId,
      );

      const otherThreadId = buildThreadId(
        confessionId,
        '44444444-4444-4444-8444-444444444444',
      );

      await expect(
        decryptMessage(
          ciphertext,
          author.privateKey,
          sender.publicKey,
          otherThreadId,
        ),
      ).rejects.toThrow();
    });
  });

  it('cannot decrypt with wrong thread id', async () => {
    const sender = await generateMessageKeyPair();
    const author = await generateMessageKeyPair();

    const ciphertext = await encryptMessage(
      'Bound to thread',
      sender.privateKey,
      author.publicKey,
      threadId,
    );

    await expect(
      decryptMessage(
        ciphertext,
        author.privateKey,
        sender.publicKey,
        buildThreadId(confessionId, '33333333-3333-4333-8333-333333333333'),
      ),
    ).rejects.toThrow();
  });

  describe('key backup (new device / recovery)', () => {
    it('wraps and unwraps private keys with passphrase', async () => {
      const keys = await generateMessageKeyPair();
      const wrapped = await wrapPrivateKeyWithPassphrase(
        keys.privateKey,
        'correct horse battery staple',
      );

      const restored = await unwrapPrivateKeyWithPassphrase(
        wrapped,
        'correct horse battery staple',
      );

      expect(restored).toBe(keys.privateKey);
    });

    it('fails unwrap with wrong passphrase', async () => {
      const keys = await generateMessageKeyPair();
      const wrapped = await wrapPrivateKeyWithPassphrase(
        keys.privateKey,
        'correct horse battery staple',
      );

      await expect(
        unwrapPrivateKeyWithPassphrase(wrapped, 'wrong passphrase'),
      ).rejects.toThrow();
    });

    it('simulates lost local key: new device cannot read old messages without backup', async () => {
      const sender = await generateMessageKeyPair();
      const author = await generateMessageKeyPair();

      const ciphertext = await encryptMessage(
        'Before device loss',
        sender.privateKey,
        author.publicKey,
        threadId,
      );

      const newDeviceSender = await generateMessageKeyPair();

      await expect(
        decryptMessage(
          ciphertext,
          newDeviceSender.privateKey,
          author.publicKey,
          threadId,
        ),
      ).rejects.toThrow();

      const wrapped = await wrapPrivateKeyWithPassphrase(
        sender.privateKey,
        'recovery-passphrase',
      );
      const restoredSenderPrivate = await unwrapPrivateKeyWithPassphrase(
        wrapped,
        'recovery-passphrase',
      );

      const recovered = await decryptMessage(
        ciphertext,
        restoredSenderPrivate,
        author.publicKey,
        threadId,
      );

      expect(recovered).toBe('Before device loss');
    });
  });
});
