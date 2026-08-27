import sanitizeHtml from 'sanitize-html';

const CONFESSION_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  ],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/** Allow limited markdown-friendly HTML; strip scripts and unsafe tags. */
export const sanitizeConfession = (value: string): string =>
  sanitizeHtml(value, CONFESSION_OPTIONS).trim();

/** Strip all HTML — plain text only. Use for comments and usernames. */
export const sanitizePlainText = (value: string): string =>
  sanitizeHtml(value, PLAIN_TEXT_OPTIONS).trim();

/** Strip HTML then escape SQL/regex special characters used in search. */
export const sanitizeSearchQuery = (value: string): string =>
  sanitizeHtml(value, PLAIN_TEXT_OPTIONS).replace(/[%_\\]/g, '\\$&').trim();

/** General-purpose XSS escape for unclassified string values. */
export const sanitize = (value: string): string =>
  sanitizeHtml(value, PLAIN_TEXT_OPTIONS);
