# Attachment preview: retry on failed image load

The `AttachmentPreview` component (`app/components/confession/AttachmentPreview.tsx`)
distinguishes between an **upload failure** and a **preview failure** and
provides an explicit retry affordance for the latter, without ever
re-uploading the underlying file.

## What counts as a preview failure

A preview failure is an `onError` fired by the inline `<img>` after an
attachment has already been successfully uploaded. Typical causes: the CDN
URL is 404ing on cold cache, the image is blocked by a transient network
error, or the file is still propagating through storage.

An **upload failure** is handled separately in
`AttachmentUploadList.tsx`, which already exposes its own `Retry` button
and whose retry re-attempts the upload.

The copy on the preview-failure block says so explicitly:

> The file was uploaded successfully — the preview can't be fetched right
> now. Retrying only reloads the image; it won't re-upload the file.

## Retry behaviour

- The retry button lives inside the error block (`role="group"`,
  `aria-label="Preview failed for <filename>"`) and is labelled
  `Retry loading preview for <filename>`.
- Clicking it increments an internal `retryCount`, clears the failure flag,
  and re-renders the `<img>`. The `src` gets a `?__preview_retry=N`
  (or `&__preview_retry=N`) query parameter so a broken cached response in
  the browser or an intermediate CDN cannot satisfy the new request.
- The React `key` of the image is also updated to the new count so the
  browser treats it as a new node and actually performs a fresh fetch.
- The download link in the `figcaption` remains available throughout, so a
  user whose preview keeps failing is never fully stuck.

## Why it never re-uploads

The preview is a pure read path. It accepts a `url` prop and renders a
single `<img src={url}>`. There is no upload handler in this component,
and the retry handler only changes internal render state. The upload path
lives in `useAttachmentUpload` and is invoked exclusively by the composer,
not by this component.

## Automated verification

`app/components/confession/__tests__/AttachmentPreview.test.tsx`:

- Triggers an `onError` on the inline image and asserts that:
  - The retry error block renders with its accessible name.
  - The retry button is present with the filename in its aria-label.
  - The download link is still available.
  - The copy distinguishes the preview failure from an upload failure.
- Clicks retry and asserts the image is back in the DOM with a cache-bust
  query parameter.
- Verifies the retry affordance is NOT shown for non-image attachments
  (e.g. a PDF).

## Failure-safety

- The retry handler is internal state only — no network error is surfaced
  to the user other than the generic copy; no filename metadata beyond
  what was already rendered leaks into any error path.
- No secrets, tokens, or private content are added to the cache-bust query
  parameter: it is a monotonic counter.
