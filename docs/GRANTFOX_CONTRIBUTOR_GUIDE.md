# GrantFox Contributor Guide

This guide is the starting point for external contributors working on xConfess
issues labeled for the GrantFox campaign.

## 1. Pick the Right Issue

Before starting work, confirm all of the following on the GitHub issue:

- The issue is open.
- The issue has both `GrantFox OSS` and `Official Campaign` labels.
- The issue has no assignee unless the assignee is you.
- There is no open pull request already linked to the issue.
- The scope and acceptance criteria are clear enough to implement in one small
  pull request.

GrantFox payout, eligibility, identity, and tax details are handled on the
GrantFox platform. Do not put personal identity documents, payment details, or
private GrantFox account information in GitHub issues or pull requests.

## 2. Clone and Install

Use a fresh checkout when possible:

```bash
git clone https://github.com/Xconfess/Xconfess.git
cd Xconfess
npm install
```

The repository requires Node.js >= 18 and npm >= 9.

## 3. Start Local Services

The local stack uses Postgres and Redis from `compose.yaml`:

```bash
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
```

Wait until both services are healthy before booting the app.

## 4. Configure Environment Files

Copy the example files only. Never commit `.env`, `.env.local`, real tokens, or
private keys.

```bash
cp xconfess-backend/.env.example xconfess-backend/.env
cp xconfess-frontend/.env.example xconfess-frontend/.env.local
```

For local development, replace placeholder values such as `change-me` with local
test values. Keep Stellar secrets on testnet only, and redact all secrets from
logs before posting them in GitHub.

## 5. Create a Focused Branch

Use a branch name that includes the issue number and the area you are changing:

```bash
git checkout -b fix/backend-draft-module-1114
```

Keep one issue per branch and one issue per pull request. If you notice another
bug while working, open a separate issue instead of bundling it into the same PR.

## 6. Validate Your Change

Run the smallest useful checks while developing, then run the full CI command
before submitting when the repository state allows it.

Common focused commands:

```bash
npm run backend:test
npm run frontend:test
npm run contract:test
npm run backend:lint
npm run frontend:lint
npm run contract:lint
npm run backend:build
npm run frontend:build
```

Full validation from the repository root:

```bash
npm run ci
```

If a full command fails because of an existing unrelated issue, include the
failure summary in the PR description and list the focused commands that passed.

## 7. Open the Pull Request

Every GrantFox PR must link the issue with a closing keyword:

```text
Closes #1114
```

Fill out every section of the pull request template:

- `Closes`: the exact issue number.
- `What changed`: one short paragraph.
- `Why`: the user or maintainer problem being solved.
- `How to test`: commands and manual steps from a fresh checkout.
- `Scope check`: confirm the PR stays within the issue.
- `Evidence`: paste test output or describe any blocked checks.
- `Screenshots`: use `N/A` for non-UI changes.

Do not leave empty template sections. Use `N/A` when a section does not apply.

## 8. Ready for Review

After opening the PR:

1. Confirm the branch is up to date with `main`.
2. Confirm there are no unrelated files in the diff.
3. Confirm your PR says `Closes #ISSUE_NUMBER`.
4. Leave a ready-for-review comment using
   [the Wave 5 template](WAVE_5_READY_FOR_REVIEW_TEMPLATE.md).

## Checklist

Use this before posting your PR:

- [ ] Issue has `GrantFox OSS` and `Official Campaign` labels.
- [ ] Branch includes only one issue's work.
- [ ] No secrets, tokens, private keys, emails, or payment details are included.
- [ ] Environment files were copied from examples, not committed.
- [ ] Focused tests for the touched area pass.
- [ ] `npm run ci` was run, or a clear unrelated blocker is documented.
- [ ] PR body includes `Closes #ISSUE_NUMBER`.
- [ ] PR template has no empty sections.

Related docs:

- [README local development](../README.md#local-development)
- [Small PR policy](SMALL_PR_POLICY.md)
- [Wave 5 contributor FAQ](WAVE_5_CONTRIBUTOR_FAQ.md)
- [Contributor logs guide](CONTRIBUTOR_LOGS_GUIDE.md)
