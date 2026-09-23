import {
  AddFeedKeysetIndexes20260923000001,
  FEED_KEYSET_INDEXES,
} from '../migrations/20260923000001-add-feed-keyset-indexes';

const makeRunner = (tables: Record<string, string[]>) => ({
  query: jest.fn(),
  getTable: jest.fn(async (name: string) =>
    tables[name]
      ? { findColumnByName: (c: string) => tables[name].includes(c) }
      : undefined,
  ),
});

describe('AddFeedKeysetIndexes20260923000001', () => {
  const migration = new AddFeedKeysetIndexes20260923000001();

  it('creates each index when its table and columns exist', async () => {
    const runner = makeRunner({
      anonymous_confessions: ['created_at', 'id', 'isDeleted', 'is_hidden'],
      comments: ['confessionId', 'isDeleted'],
    });

    await migration.up(runner as any);

    expect(runner.query.mock.calls.map(([sql]) => sql)).toEqual(
      FEED_KEYSET_INDEXES.map((i) => i.sql),
    );
  });

  it('skips indexes whose columns are missing', async () => {
    const runner = makeRunner({ anonymous_confessions: ['created_at'] });

    await migration.up(runner as any);

    expect(runner.query).not.toHaveBeenCalled();
  });

  it('is reversible: down drops every index up creates', async () => {
    const runner = makeRunner({});

    await migration.down(runner as any);

    for (const { name } of FEED_KEYSET_INDEXES) {
      expect(runner.query).toHaveBeenCalledWith(
        `DROP INDEX IF EXISTS "${name}";`,
      );
    }
  });
});
