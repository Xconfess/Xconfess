# Attachment preview policy

The attachment preview UI renders content inline only when both the normalized
MIME type and filename extension are allowlisted:

| MIME type | Extensions |
| --- | --- |
| `image/jpeg` | `.jpg`, `.jpeg` |
| `image/png` | `.png` |
| `image/webp` | `.webp` |
| `image/gif` | `.gif` |

Everything else, including SVG, PDF, HTML, plain text, missing types, unknown
types, and mismatched MIME/extension pairs, is presented as a download rather
than embedded as active content. An image load failure also falls back to the
download state. Only absolute `https:` and `blob:` URLs are accepted; other
schemes are not linked.

Filenames are rendered as React text and passed through the DOM `download`
property, not interpolated into HTML. This keeps markup-like names inert.
Attachment preview policy is a presentation boundary, not upload validation:
the backend remains responsible for validating uploaded content and serving
private files only to authorized users.

The allowlist is defined in `app/lib/utils/attachmentPreview.ts`. Keep it
aligned with the attachment upload policy in `app/lib/utils/attachmentValidation.ts`;
uploadable PDFs and plain-text files intentionally remain download-only.
