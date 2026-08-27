# Maintainer Dashboard Sync Checklist

Use this checklist to keep GitHub issue status aligned with the Drips Wave dashboard. Run it at least once per week during Wave 5, and again before the Wave 5 deadline.

To find all open Stellar Wave issues, filter by the `Stellar Wave` label:
`is:issue is:open label:"Stellar Wave"`

---

## Issue state transitions

Work through the open issue list and apply the correct state for each.

### Assigned

- [ ] The issue has an assignee set in GitHub.
- [ ] The assignee has acknowledged the issue (commented or opened a draft PR).
- [ ] If no acknowledgment within 4 hours of assignment, ping the contributor per the process in `WAVE_5_CONTRIBUTOR_ASSIGNMENT.md`.

### In progress

- [ ] A draft PR or branch exists with at least one meaningful commit.
- [ ] The issue has a status comment from the assignee or maintainer showing recent activity.
- [ ] If no visible progress after 5 days, ask for a status update in the issue thread.

### Blocked

- [ ] A `blocked` label is applied to the issue.
- [ ] A comment explains what the issue is waiting on and who owns the unblock.
- [ ] The issue is removed from the active Wave queue until the blocker resolves.
- [ ] Check back within 48 hours to see if the blocker has cleared.

### Merged

- [ ] The PR that closes the issue has been merged.
- [ ] The issue is closed (GitHub closes it automatically if the PR uses `Closes #NNN`; verify).
- [ ] The issue no longer appears in the open `Stellar Wave` query above.
- [ ] Add the issue and PR to the Wave 5 progress report using `WAVE_5_PROGRESS_TEMPLATE.md`.

### Closed (without merge)

- [ ] A comment explains why the issue was closed without a merged PR.
- [ ] The `Stellar Wave` label is removed if the issue will not be re-opened in this wave.
- [ ] If the work is partially complete and salvageable, open a follow-up issue and link it.

---

## Pre-deadline sweep

Run this additional sweep before the Wave 5 deadline.

- [ ] Every open `Stellar Wave` issue has either an open PR or a clear owner comment.
- [ ] Issues with no activity for > 7 days have been pinged or closed.
- [ ] Issues that cannot close before the deadline are labeled and noted for rollover.
- [ ] All merged PRs are reflected as closed issues — no merged-but-open stragglers.
- [ ] The Wave 5 progress report (`WAVE_5_PROGRESS_TEMPLATE.md`) is up to date.
- [ ] `maintainer/BACKLOG_INDEX.md` reflects any new issues added during Wave 5.

---

## Notes

- Always leave a comment when changing issue state so the contributor and other maintainers have a clear audit trail.
- Do not close an issue as completed unless the corresponding PR has been reviewed and merged.
- If an issue was assigned but the contributor is unresponsive for > 7 days after pings, close per the process in `WAVE_5_CONTRIBUTOR_ASSIGNMENT.md`.
