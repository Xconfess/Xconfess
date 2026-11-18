/**
 * Normalizes a raw search term before it reaches full-text search.
 *
 * Only three things change:
 *  - Unicode compatibility forms are folded (NFKC), so full-width digits and
 *    ligatures match their plain equivalents.
 *  - Runs of whitespace and control characters become a single space.
 *  - Punctuation and symbols become a space, so `!!!love???` becomes `love`.
 *
 * Letters, digits and combining marks from every script are kept. Accented
 * Latin, CJK, Arabic and Devanagari queries keep their meaning instead of
 * being reduced to their ASCII letters.
 */
const SEPARATOR_PATTERN = /[\p{P}\p{S}\p{Z}\p{Cc}]+/gu;

export function normalizeSearchQuery(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(SEPARATOR_PATTERN, ' ')
    .trim();
}
