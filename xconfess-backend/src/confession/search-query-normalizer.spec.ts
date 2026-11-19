import { normalizeSearchQuery } from './search-query-normalizer';

describe('normalizeSearchQuery', () => {
  describe('empty and whitespace input', () => {
    it('returns an empty string for an empty query', () => {
      expect(normalizeSearchQuery('')).toBe('');
    });

    it('returns an empty string for whitespace-only input', () => {
      expect(normalizeSearchQuery('   \t\n  ')).toBe('');
    });

    it('returns an empty string when only punctuation is provided', () => {
      expect(normalizeSearchQuery('!!!???...')).toBe('');
    });
  });

  describe('whitespace', () => {
    it('trims and collapses runs of spaces, tabs and newlines', () => {
      expect(normalizeSearchQuery('  work \t\n stress  ')).toBe(
        'work stress',
      );
    });

    it('treats non-breaking and other Unicode spaces as separators', () => {
      expect(normalizeSearchQuery('work stress now')).toBe(
        'work stress now',
      );
    });

    it('removes ASCII control characters used as separators', () => {
      expect(normalizeSearchQuery('work\u0000stress')).toBe('work stress');
    });
  });

  describe('punctuation and symbols', () => {
    it('replaces surrounding punctuation without touching the word', () => {
      expect(normalizeSearchQuery('!!!love???')).toBe('love');
    });

    it('splits words joined by punctuation', () => {
      expect(normalizeSearchQuery('love,hate;fear')).toBe('love hate fear');
    });

    it('replaces symbols such as ampersand and pipe', () => {
      expect(normalizeSearchQuery('cats & dogs | birds')).toBe(
        'cats dogs birds',
      );
    });

    it('splits CJK punctuation as well as ASCII punctuation', () => {
      expect(normalizeSearchQuery('東京、大阪')).toBe('東京 大阪');
    });
  });

  describe('Unicode preservation', () => {
    it('keeps accented Latin letters', () => {
      expect(normalizeSearchQuery('Café déjà vu')).toBe('Café déjà vu');
    });

    it('composes decomposed accents so they match precomposed input', () => {
      expect(normalizeSearchQuery('Café')).toBe('Café');
    });

    it('keeps CJK characters', () => {
      expect(normalizeSearchQuery('東京 タワー')).toBe('東京 タワー');
    });

    it('keeps Arabic text', () => {
      expect(normalizeSearchQuery('مرحبا بالعالم')).toBe('مرحبا بالعالم');
    });

    it('keeps Devanagari text including combining vowel signs', () => {
      expect(normalizeSearchQuery('नमस्ते दुनिया')).toBe('नमस्ते दुनिया');
    });

    it('folds compatibility forms with NFKC', () => {
      expect(normalizeSearchQuery('ＡＢＣ１２３')).toBe('ABC123');
      expect(normalizeSearchQuery('ﬁle')).toBe('file');
    });
  });

  describe('mixed-script input', () => {
    it('keeps every script and separates them by whitespace', () => {
      expect(normalizeSearchQuery('hello, 世界 мир!')).toBe('hello 世界 мир');
    });

    it('keeps Latin and Arabic words together', () => {
      expect(normalizeSearchQuery('(Hello) مرحبا')).toBe('Hello مرحبا');
    });
  });

  describe('idempotency', () => {
    it('returns the same result when applied twice', () => {
      const inputs = ['  !!Café, 東京!!  ', 'Ｈｅｌｌｏ;world', 'नमस्ते'];
      for (const input of inputs) {
        const once = normalizeSearchQuery(input);
        expect(normalizeSearchQuery(once)).toBe(once);
      }
    });
  });
});
