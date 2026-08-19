import {
  validateFileAttachment,
  sanitizeFileName,
  matchesMagicBytes,
  MAX_FILE_SIZE_BYTES,
} from './file-attachment.validator';

describe('sanitizeFileName', () => {
  it('removes path traversal attempts', () => {
    expect(sanitizeFileName('../../etc/passwd')).not.toContain('..');
  });

  it('removes null bytes', () => {
    expect(sanitizeFileName('file\x00.jpg')).toBe('file_.jpg');
  });

  it('removes angle brackets and quotes', () => {
    expect(sanitizeFileName('<script>alert(1)</script>')).not.toContain('<');
    expect(sanitizeFileName('file"name.jpg')).not.toContain('"');
  });

  it('truncates to 255 chars', () => {
    const long = 'a'.repeat(300) + '.txt';
    expect(sanitizeFileName(long).length).toBeLessThanOrEqual(255);
  });

  it('returns empty string for entirely invalid input', () => {
    expect(sanitizeFileName('...')).toBe('');
  });
});

describe('matchesMagicBytes', () => {
  it('detects JPEG header', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(matchesMagicBytes('image/jpeg', buf)).toBe(true);
  });

  it('rejects mismatched content', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
    expect(matchesMagicBytes('image/jpeg', buf)).toBe(false);
  });

  it('returns true for types without magic bytes', () => {
    const buf = Buffer.from('hello');
    expect(matchesMagicBytes('text/plain', buf)).toBe(true);
  });

  it('detects PDF header', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(matchesMagicBytes('application/pdf', buf)).toBe(true);
  });
});

describe('validateFileAttachment', () => {
  const validBase = {
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024 * 1024,
  };

  it('passes valid attachments', () => {
    const result = validateFileAttachment(validBase);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty filenames', () => {
    const result = validateFileAttachment({ ...validBase, originalName: '' });
    expect(result.errors).toContain('Filename is empty or contains only invalid characters');
  });

  it('rejects unsupported MIME types', () => {
    const result = validateFileAttachment({ ...validBase, mimeType: 'application/x-msdownload' });
    expect(result.errors.some((e) => e.includes('not allowed'))).toBe(true);
  });

  it('rejects HTML files explicitly', () => {
    const result = validateFileAttachment({ ...validBase, mimeType: 'text/html' });
    expect(result.errors.some((e) => e.includes('not permitted'))).toBe(true);
  });

  it('rejects SVG files (can contain scripts)', () => {
    const result = validateFileAttachment({ ...validBase, mimeType: 'image/svg+xml' });
    expect(result.errors.some((e) => e.includes('not permitted'))).toBe(true);
  });

  it('rejects zero-byte files', () => {
    const result = validateFileAttachment({ ...validBase, sizeBytes: 0 });
    expect(result.errors.some((e) => e.includes('greater than zero'))).toBe(true);
  });

  it('rejects oversized files', () => {
    const result = validateFileAttachment({ ...validBase, sizeBytes: MAX_FILE_SIZE_BYTES + 1 });
    expect(result.errors.some((e) => e.includes('exceeds the maximum'))).toBe(true);
  });

  it('rejects content that does not match the declared MIME type', () => {
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = validateFileAttachment(
      { ...validBase, mimeType: 'image/jpeg' },
      pngBuf,
    );
    expect(result.errors.some((e) => e.includes('does not match'))).toBe(true);
  });

  it('validates metadata field lengths', () => {
    const result = validateFileAttachment({
      ...validBase,
      metadata: { description: 'x'.repeat(600) },
    });
    expect(result.errors.some((e) => e.includes('Metadata field'))).toBe(true);
  });
});
