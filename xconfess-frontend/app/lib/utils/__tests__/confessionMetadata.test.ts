import {
  buildConfessionMetadata,
  confessionPublicUrl,
  isConfessionPreviewable,
} from '../confessionMetadata';

const APP = 'https://xconfess.test';
const ID = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';
const SECRET = 'very private hidden text';

describe('isConfessionPreviewable', () => {
  it('allows published, visible confessions', () => {
    expect(
      isConfessionPreviewable({ status: 'published', moderationStatus: 'pending' }),
    ).toBe(true);
  });

  it.each([
    [{ isDeleted: true }],
    [{ deletedAt: '2026-01-01' }],
    [{ isHidden: true }],
    [{ moderationStatus: 'rejected' }],
    [{ moderationStatus: 'hidden' }],
    [{ status: 'draft' }],
    [null],
  ])('blocks %p', (data) => {
    expect(isConfessionPreviewable(data)).toBe(false);
  });
});

describe('buildConfessionMetadata', () => {
  it('never includes hidden content in previews', () => {
    const meta = JSON.stringify(
      buildConfessionMetadata(APP, ID, { content: SECRET, previewable: false }),
    );
    expect(meta).not.toContain('private');
    expect(meta).toContain('View confession on xConfess');
  });

  it('uses a generic preview for missing or deleted records', () => {
    const meta = buildConfessionMetadata(APP, ID, null);
    expect(meta.title).toBe('Confession not found — xConfess');
    expect(JSON.stringify(meta)).not.toContain(SECRET);
  });

  it('includes content for previewable confessions', () => {
    const meta = buildConfessionMetadata(APP, ID, { content: 'hello', previewable: true });
    expect(meta.description).toBe('hello');
  });

  it('only exposes the public UUID in URLs', () => {
    const meta = buildConfessionMetadata(APP, ID, { content: 'hi', previewable: true });
    expect(meta.alternates?.canonical).toBe(`${APP}/confessions/${ID}`);
    expect(JSON.stringify(meta)).not.toMatch(/userId|anonymousUserId|user_id/);
  });
});

describe('confessionPublicUrl', () => {
  it('keeps UUID references', () => {
    expect(confessionPublicUrl(APP, ID)).toBe(`${APP}/confessions/${ID}`);
  });

  it('drops non-UUID (sequential or internal) identifiers', () => {
    expect(confessionPublicUrl(APP, '42')).toBe(`${APP}/confessions`);
    expect(confessionPublicUrl(APP, '../admin')).toBe(`${APP}/confessions`);
  });
});
