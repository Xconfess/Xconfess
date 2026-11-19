# Output Escaping for User-Generated Text

Confession and comment text is stored as the author wrote it. Escaping happens
where the text is rendered, for the context it is rendered in. Escaping on write
would alter stored content, for example turning `Tom & Jerry` into
`Tom &amp; Jerry` permanently, and would be wrong for every context that does not
use HTML.

Helpers live in `xconfess-backend/src/utils/output-escape.ts`.

## Rendering contexts

| Context                          | Where                                              | Escaping applied                                                                 |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Email HTML body                  | `renderTemplate` (`html`) and the built-in fallback generators | `escapeHtml` on every user-supplied value, including URLs placed in `href` |
| Email plain-text body            | `renderTemplate` (`text`) and fallback text        | None. Plain text has no markup. Values are inserted as-is.                       |
| Email subject                    | `renderTemplate` (`subject`)                       | Line breaks replaced with spaces, so a value cannot add a mail header            |
| CSV data export                  | `DataExportService.convertToCsv` → `toCsv`         | RFC 4180 quoting, and a leading `'` on text that starts with `= + - @ TAB CR`   |
| JSON API responses               | Controllers                                        | None. JSON encoding handles it; the frontend escapes when it renders.            |

## What `escapeHtml` does

It replaces `& < > " '` with HTML entities. Ampersands are replaced first in
the mapping, so nothing is double-escaped. Use it for element content and quoted
attribute values. Do not use it on a value that is already HTML, because that
value will show its tags as text.

## What `escapeCsvCell` does

- Quotes a cell when it contains a comma, quote, or line break, and doubles any
  quotes inside it.
- Prefixes a single quote to **string** values that start with `=`, `+`, `-`,
  `@`, tab, or carriage return. Spreadsheets then show the value as text instead
  of evaluating it as a formula. Numbers, booleans, and dates are never prefixed,
  so exported numeric values are unchanged.
- Serialises objects as JSON and renders `null` and `undefined` as empty cells.

`toCsv` reads each row by the header keys, so a row whose keys are in a different
order still lands in the right columns.

## Template variables

Template placeholders are `{{name}}`. Each placeholder is validated against the
template's variable schema before rendering, so an unknown or mistyped variable
is rejected rather than rendered. Escaping is applied after validation and only
affects the output for that part.

## Known limits

- **Write-time sanitisation is unchanged.** `ConfessionService.sanitizeMessage`
  still uses `recursiveEscape`, so stored text already contains HTML entities for
  `&`, `<`, and `>`. Changing that alters stored data and needs its own issue
  with a migration plan. Render-time escaping is what keeps these entities from
  being interpreted as markup.
- The formula guard also prefixes text such as `-- note`. That is intentional; a
  leading `-` in a spreadsheet is a formula trigger.

## Testing

- `src/utils/output-escape.spec.ts` covers the helpers, including HTML-like and
  script-like input.
- `src/email/email.service.spec.ts` checks that `renderTemplate` escapes `html`,
  leaves `text` raw, and strips line breaks from the subject.
