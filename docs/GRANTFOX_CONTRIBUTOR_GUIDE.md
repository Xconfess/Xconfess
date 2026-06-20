# GrantFox Contributor Guide

This guide is for external GrantFox contributors working on xConfess campaign issues. It collects the local setup, validation, and pull request rules needed to submit a reviewable PR without production access.

## Before You Start

Use this guide only for issues that carry both campaign labels:

- `GrantFox OSS`
- `Official Campaign`

Issues may also carry `Maybe Rewarded`. That label means the issue may be eligible for a GrantFox reward, but maintainers and the GrantFox platform decide final acceptance and payout.

Do not copy production secrets, wallet seeds, private keys, real user data, or private service URLs into issues, commits, PR descriptions, screenshots, or logs.

GrantFox account, payment, tax, or KYC steps live on the GrantFox platform. This repository guide only covers the xConfess development workflow.

## Claim and Scope Checklist

Before writing code or docs:

1. Confirm the issue is still open.
2. Confirm there is no assignee.
3. Confirm the issue has no linked branch or open PR under the GitHub Development section.
4. Read the full issue body, especially Scope, Out of scope, Files, Acceptance criteria, and How to test.
5. Keep the PR limited to the files and behavior requested by the issue.

If the issue is already assigned or has an open PR, choose a different issue.

## Local Setup

Run these commands from a clean checkout.

```bash
git clone https://github.com/Xconfess/Xconfess.git
cd Xconfess
npm install
```

Start local infrastructure:

```bash
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
```

Copy environment templates:

```bash
cp xconfess-backend/.env.example xconfess-backend/.env
cp xconfess-frontend/.env.example xconfess-frontend/.env.local
```

For local-only values, use placeholders or generated development secrets. Never commit `.env`, `.env.local`, logs containing secrets, or screenshots showing secrets.

Run the full validation command requested by campaign issues:

```bash
npm run ci
```

For narrower local checks while developing, use the relevant package scripts:

```bash
npm run backend:test
npm run backend:lint
npm run backend:build
npm run frontend:test
npm run frontend:lint
npm run frontend:build
npm run contract:test
```

## Branch Naming

Use a branch name that includes the issue number and a short description.

Examples:

```bash
git checkout -b grantfox/1118-contributor-guide
git checkout -b grantfox/1128-search-validation
```

## Commit and PR Rules

Keep commits focused on the issue. Do not combine unrelated cleanup, formatting churn, dependency updates, or broad refactors with the campaign task.

The PR body must link the issue with the GitHub closing keyword:

```markdown
Closes #ISSUE_NUMBER
```

For example:

```markdown
Closes #1118
```

Use this PR body structure:

```markdown
## Summary

- What changed
- Why it satisfies the issue

## Validation

- [ ] npm run ci
- [ ] Any narrower command used while developing

## Notes

- Mention any known repository-wide failure that is unrelated to this PR
- Confirm no production secrets or real user data are included

Closes #ISSUE_NUMBER
```

## Validation Checklist

Before opening the PR:

- [ ] The PR only changes files needed for the issue.
- [ ] The PR body includes `Closes #ISSUE_NUMBER`.
- [ ] The issue has `GrantFox OSS` and `Official Campaign` labels.
- [ ] `npm run ci` was run, or any blocker is documented with the exact failing command and error.
- [ ] Tests or docs were updated according to the acceptance criteria.
- [ ] No `.env`, `.env.local`, private keys, tokens, seed phrases, real user data, or production URLs are committed.
- [ ] Screenshots and logs are redacted before upload.
- [ ] The PR title names the subsystem and the issue goal.

## Review Handoff

When the PR is ready, include the validation output summary in the PR body. If a command fails because of an existing repository-wide issue unrelated to your change, include:

- the exact command
- the first relevant error
- why it is unrelated to the PR

Maintainers can then review the issue scope, changed files, and validation evidence without asking for private environment details.
