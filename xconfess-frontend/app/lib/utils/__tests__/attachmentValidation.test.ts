import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  formatBytes,
  normalizeMimeType,
  uploadIfValid,
  validateAttachment,
  validateAttachments,
  type AttachmentLike,
} from '../attachmentValidation';

const makeFile = (overrides: Partial<AttachmentLike> = {}): AttachmentLike => ({
  name: 'photo.png',
  size: 1024,
  type: ALLOWED_ATTACHMENT_MIME_TYPES[0] ?? 'image/png',
  ...overrides,
});

describe('validateAttachment - accepted files', () => {
  it.each([...ALLOWED_ATTACHMENT_MIME_TYPES])('accepts an allowed type: %s', (mime) => {
    const result = validateAttachment(makeFile({ type: mime }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a file exactly at the size limit', () => {
    const result = validateAttachment(makeFile({ size: MAX_ATTACHMENT_SIZE_BYTES }));
    expect(result.valid).toBe(true);
  });

  it('normalizes MIME type case and parameters', () => {
    const first = ALLOWED_ATTACHMENT_MIME_TYPES[0] ?? 'image/png';
    const result = validateAttachment(makeFile({ type: `${first.toUpperCase()}; foo=bar` }));
    expect(result.valid).toBe(true);
  });
});

describe('validateAttachment - rejected files', () => {
  it('rejects a file 1 byte over the limit with an actionable message', () => {
    const result = validateAttachment(makeFile({ size: MAX_ATTACHMENT_SIZE_BYTES + 1 }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe('FILE_TOO_LARGE');
    expect(result.errors[0]?.message).toContain('photo.png');
    expect(result.errors[0]?.message).toContain(formatBytes(MAX_ATTACHMENT_SIZE_BYTES));
  });

  it('rejects an empty file', () => {
    const result = validateAttachment(makeFile({ size: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe('EMPTY_FILE');
  });

  it.each(['application/x-msdownload', 'text/html', 'application/x-sh'])(
    'rejects an unsupported type: %s',
    (mime) => {
      const result = validateAttachment(makeFile({ name: 'bad.bin', type: mime }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.code).toBe('UNSUPPORTED_TYPE');
      expect(result.errors[0]?.message).toContain('bad.bin');
    },
  );

  it('rejects a file with no detectable type', () => {
    const result = validateAttachment(makeFile({ type: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe('MISSING_TYPE');
  });

  it('reports every problem at once', () => {
    const result = validateAttachment(
      makeFile({ size: MAX_ATTACHMENT_SIZE_BYTES + 1, type: 'application/x-msdownload' }),
    );
    expect(result.errors.map((e) => e.code)).toEqual(['FILE_TOO_LARGE', 'UNSUPPORTED_TYPE']);
  });
});

describe('validateAttachment - custom policy', () => {
  const policy = { maxSizeBytes: 10, allowedMimeTypes: ['text/plain'] };

  it('uses the policy it is given', () => {
    expect(validateAttachment({ name: 'a.txt', size: 10, type: 'text/plain' }, policy).valid).toBe(true);
    expect(validateAttachment({ name: 'a.txt', size: 11, type: 'text/plain' }, policy).valid).toBe(false);
    expect(validateAttachment({ name: 'a.png', size: 5, type: 'image/png' }, policy).valid).toBe(false);
  });
});

describe('validateAttachments', () => {
  it('splits accepted and rejected files', () => {
    const good = makeFile({ name: 'good.png' });
    const tooBig = makeFile({ name: 'big.png', size: MAX_ATTACHMENT_SIZE_BYTES + 1 });
    const wrongType = makeFile({ name: 'run.exe', type: 'application/x-msdownload' });

    const { accepted, rejected } = validateAttachments([good, tooBig, wrongType]);

    expect(accepted).toEqual([good]);
    expect(rejected.map((r) => r.file.name)).toEqual(['big.png', 'run.exe']);
  });
});

describe('uploadIfValid', () => {
  it('uploads a valid file exactly once', async () => {
    let calls = 0;
    const upload = async (file: AttachmentLike) => {
      calls += 1;
      return `uploaded:${file.name}`;
    };

    const outcome = await uploadIfValid(makeFile(), upload);

    expect(calls).toBe(1);
    expect(outcome).toEqual({ ok: true, result: 'uploaded:photo.png' });
  });

  it('never calls upload for an invalid file', async () => {
    let calls = 0;
    const upload = async () => {
      calls += 1;
      return 'should-not-happen';
    };

    const outcome = await uploadIfValid(makeFile({ type: 'text/html' }), upload);

    expect(calls).toBe(0);
    expect(outcome.ok).toBe(false);
  });
});

describe('backend policy alignment', () => {
  // Mirrors xconfess-backend/src/validators/file-attachment.validator.ts.
  // If the backend policy changes, update the constants and this test together.
  it('matches the backend size limit and allowed types', () => {
    expect(MAX_ATTACHMENT_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect([...ALLOWED_ATTACHMENT_MIME_TYPES].sort()).toEqual(
      [
        'application/pdf',
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
      ].sort(),
    );
  });
});

describe('helpers', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('normalizes MIME types', () => {
    expect(normalizeMimeType('IMAGE/PNG; charset=binary')).toBe('image/png');
    expect(normalizeMimeType('')).toBe('');
    expect(normalizeMimeType(undefined)).toBe('');
  });
});