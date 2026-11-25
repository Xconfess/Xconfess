const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for HTML element content or a quoted attribute value.
 *
 * Applied when rendering, never when storing, so confession text keeps the
 * exact characters the author wrote.
 */
export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

/** Characters that make a spreadsheet treat a cell as a formula. */
const CSV_FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Formats one CSV cell per RFC 4180 and neutralises spreadsheet formula
 * injection. Text that starts with a formula trigger gets a leading single
 * quote so Excel and Sheets show it as text instead of evaluating it.
 */
export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';

  let text: string;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }

  const guarded =
    typeof value === 'string' && CSV_FORMULA_TRIGGER.test(text)
      ? `'${text}`
      : text;
  const escaped = guarded.replace(/"/g, '""');

  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
};

/**
 * Serialises rows to CSV. Column order follows the keys of the first row, and
 * every row is read by those keys so values stay in their own columns.
 */
export const toCsv = (rows: Record<string, unknown>[]): string => {
  if (!rows || rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(escapeCsvCell).join(',');
  const body = rows
    .map((row) => headers.map((key) => escapeCsvCell(row[key])).join(','))
    .join('\n');

  return `${headerLine}\n${body}`;
};
