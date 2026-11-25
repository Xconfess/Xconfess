import { buildExportManifest } from './export-manifest';

describe('buildExportManifest', () => {
  const data = {
    userId: 'user-1',
    exportedAt: '2026-11-20T10:00:00.000Z',
    userStatus: 'active',
    confessions: [{ id: 'c1', message: 'secret text' }, { id: 'c2' }],
    messages: [{ id: 'm1', content: 'private message' }],
    reactions: [],
    _redactionPolicy: { deletedContentMasked: true },
  };

  it('lists included categories with counts and the generation time', () => {
    const manifest = buildExportManifest(data, ['complete_data.json']);
    expect(manifest.generatedAt).toBe('2026-11-20T10:00:00.000Z');
    expect(manifest.categories).toEqual([
      { name: 'confessions', count: 2 },
      { name: 'messages', count: 1 },
      { name: 'reactions', count: 0 },
    ]);
  });

  it('matches the files actually written to the archive', () => {
    const files = ['complete_data.json', 'confessions.csv'];
    expect(buildExportManifest(data, files).files).toEqual(files);
  });

  it('never includes record contents or internal fields', () => {
    const json = JSON.stringify(buildExportManifest(data, []));
    expect(json).not.toContain('secret text');
    expect(json).not.toContain('private message');
    expect(json).not.toContain('user-1');
    expect(json).not.toContain('_redactionPolicy');
  });
});
