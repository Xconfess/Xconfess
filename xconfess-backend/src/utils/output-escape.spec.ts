import { escapeCsvCell, escapeHtml, toCsv } from './output-escape';

describe('escapeHtml', () => {
  it('escapes markup-significant characters', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it("escapes single quotes so attribute values stay quoted", () => {
    expect(escapeHtml(`' onmouseover='alert(1)`)).toBe(
      '&#39; onmouseover=&#39;alert(1)',
    );
  });

  it('escapes ampersands before other entities are produced', () => {
    expect(escapeHtml('a & b &lt;')).toBe('a &amp; b &amp;lt;');
  });

  it('returns an empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('just a normal confession')).toBe(
      'just a normal confession',
    );
  });
});

describe('escapeCsvCell', () => {
  it('quotes values containing commas, quotes or line breaks', () => {
    expect(escapeCsvCell('hello, world')).toBe('"hello, world"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('neutralises spreadsheet formula triggers in text', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil")')).toBe(
      '"\'=HYPERLINK(""http://evil"")"',
    );
    expect(escapeCsvCell('+1+1')).toBe("'+1+1");
    expect(escapeCsvCell('-2+3')).toBe("'-2+3");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('does not prefix numbers, booleans or dates', () => {
    expect(escapeCsvCell(-5)).toBe('-5');
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(true)).toBe('true');
    expect(escapeCsvCell(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '2026-01-02T03:04:05.000Z',
    );
  });

  it('serialises nested objects as JSON', () => {
    expect(escapeCsvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('renders null and undefined as empty cells', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('toCsv', () => {
  it('returns an empty string when there are no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('keeps commas inside a message within the same column', () => {
    const csv = toCsv([{ id: 1, message: 'a, b, c' }]);

    expect(csv).toBe('id,message\n1,"a, b, c"');
  });

  it('reads each row by header so a differently ordered row keeps its columns', () => {
    const csv = toCsv([
      { id: 1, message: 'first' },
      { message: 'second', id: 2 },
    ]);

    expect(csv).toBe('id,message\n1,first\n2,second');
  });
});
