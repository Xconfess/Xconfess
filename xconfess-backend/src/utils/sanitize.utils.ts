import sanitizeHtml from 'sanitize-html';

export const CONFESSION_ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'b', 'i', 'em', 'strong', 'del', 'ins', 'sub', 'sup', 'span',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'blockquote', 'code', 'pre',
  'a', 'img',
];

export const CONFESSION_ALLOWED_ATTRS: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  code: ['class'],
  pre: ['class'],
  span: ['class'],
};

export const CONFESSION_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: CONFESSION_ALLOWED_TAGS,
  allowedAttributes: CONFESSION_ALLOWED_ATTRS,
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
    img: ['http', 'https', 'data'],
  },
  disallowedTagsMode: 'discard',
};

export const PLAIN_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/** Allow markdown-friendly HTML; strip scripts, dangerous attributes, and unsafe tags. */
export const sanitizeConfession = (value: string): string =>
  sanitizeHtml(value, CONFESSION_OPTIONS).trim();

/** Strip all HTML — plain text only. Use for comments, usernames, and report notes. */
export const sanitizePlainText = (value: string): string =>
  sanitizeHtml(value, PLAIN_TEXT_OPTIONS).trim();

/** Strip HTML then escape SQL/regex special characters used in search. */
export const sanitizeSearchQuery = (value: string): string =>
  sanitizeHtml(value, PLAIN_TEXT_OPTIONS).replace(/[%_\\]/g, '\\$&').trim();

/** General-purpose XSS escape for unclassified string values. */
export const sanitize = (value: string): string =>
  sanitizeHtml(value, PLAIN_TEXT_OPTIONS).trim();
