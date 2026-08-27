import { encodeCursor, decodeCursor, CursorObject } from './cursor.util';

describe('cursor.util', () => {
  describe('encodeCursor / decodeCursor roundtrip', () => {
    it('roundtrips a simple cursor object', () => {
      const cursor: CursorObject = { id: 'abc-123', created_at: '2026-01-15T10:00:00.000Z' };
      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor<CursorObject>(encoded);

      expect(decoded).toEqual(cursor);
    });

    it('roundtrips a numeric id', () => {
      const cursor: CursorObject = { id: 42, created_at: '2026-06-01T00:00:00.000Z' };
      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor<CursorObject>(encoded);

      expect(decoded).toEqual(cursor);
      expect(decoded!.id).toBe(42);
    });

    it('roundtrips cursor with extra fields', () => {
      const cursor: CursorObject = { id: 'x', created_at: '2026-01-01', score: 99, tag: 'news' };
      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor<CursorObject>(encoded);

      expect(decoded).toEqual(cursor);
    });

    it('produces valid base64', () => {
      const encoded = encodeCursor({ id: '1', created_at: '2026-01-01' });
      // Should not throw when decoded from base64
      const buf = Buffer.from(encoded, 'base64');
      expect(buf.toString('utf8')).toContain('"id"');
    });
  });

  describe('decodeCursor with invalid input', () => {
    it('returns undefined for undefined', () => {
      expect(decodeCursor(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(decodeCursor('')).toBeUndefined();
    });

    it('returns undefined for invalid base64', () => {
      expect(decodeCursor('!!!not-base64!!!')).toBeUndefined();
    });

    it('returns undefined for valid base64 but invalid JSON', () => {
      const notJson = Buffer.from('this is not json').toString('base64');
      expect(decodeCursor(notJson)).toBeUndefined();
    });

    it('returns undefined for totally random base64', () => {
      const random = Buffer.from(Math.random().toString()).toString('base64');
      // Might parse as valid JSON (e.g. a number), so just ensure it doesn't throw
      const result = decodeCursor(random);
      // Either undefined or a parsed value — no exception
      expect(typeof result === 'undefined' || typeof result === 'object').toBe(true);
    });
  });

  describe('stable ordering with duplicate timestamps', () => {
    it('different ids produce different cursors', () => {
      const c1 = encodeCursor({ id: 'item-1', created_at: '2026-01-01T00:00:00.000Z' });
      const c2 = encodeCursor({ id: 'item-2', created_at: '2026-01-01T00:00:00.000Z' });

      expect(c1).not.toBe(c2);
    });

    it('decoded cursors preserve id for tiebreaking', () => {
      const cursor: CursorObject = { id: 'item-5', created_at: '2026-01-01T00:00:00.000Z' };
      const decoded = decodeCursor<CursorObject>(encodeCursor(cursor));

      expect(decoded!.id).toBe('item-5');
    });
  });

  describe('next/previous cursor generation pattern', () => {
    it('simulates cursor-based pagination through 3 pages', () => {
      // Simulated dataset
      const items = [
        { id: '1', created_at: '2026-01-03' },
        { id: '2', created_at: '2026-01-02' },
        { id: '3', created_at: '2026-01-01' },
      ];

      const limit = 2;

      // Page 1: no cursor
      const page1 = items.slice(0, limit);
      const nextCursor1 = encodeCursor({
        id: page1[page1.length - 1].id,
        created_at: page1[page1.length - 1].created_at,
      });

      expect(page1).toHaveLength(2);
      expect(nextCursor1).toBeTruthy();

      // Page 2: use cursor from page 1
      const cursor1 = decodeCursor<{ id: string; created_at: string }>(nextCursor1)!;
      const page2Items = items.filter(
        (item) => item.created_at < cursor1.created_at ||
          (item.created_at === cursor1.created_at && item.id < cursor1.id),
      );
      const page2 = page2Items.slice(0, limit);

      expect(page2).toHaveLength(1);
      expect(page2[0].id).toBe('3');

      // Terminal page: no next cursor
      const nextCursor2 =
        page2.length < limit
          ? null
          : encodeCursor({
              id: page2[page2.length - 1].id,
              created_at: page2[page2.length - 1].created_at,
            });

      expect(nextCursor2).toBeNull();
    });
  });
});
