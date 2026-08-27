# Template Rollout Runbook

Use this runbook when promoting email templates from canary to full rollout, or when rolling back after issues.

## Canary

1. Confirm the template key(s) to promote (e.g. `comment_notification`).
2. Ensure the canary rollout percentages and deterministic recipient bucketing are configured.
3. Trigger/allow the next email send window to exercise the canary recipients.

## Verify

- Check logs for delivery success vs. failures.
- If failures spike, inspect DLQ entries (notification dead-letter queue) and correlate to the template key and recipient bucket.

## Promote (Full Rollout)

1. Update the rollout policy so the new template version becomes the `activeVersion`.
2. Allow subsequent email sends to use the promoted version for all buckets.

## Rollback

1. Restore the rollout policy so the previous template version is the `activeVersion`.
2. Keep the canary configuration available for the next attempt.

## Evidence Checklist (before manual intervention)

- Template key in question
- Rollout policy state (active/canary versions, canary percent)
- Representative failing recipient(s) and DLQ entries for the same template key

