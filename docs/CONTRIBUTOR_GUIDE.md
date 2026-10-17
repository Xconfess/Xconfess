# Contributor Guide

This guide is the starting point for external contributors working on xConfess.
It ties together local setup, issue selection, branch names, pull request
linking, validation commands, and review handoff.

For shared product and API terminology, consult the [glossary](GLOSSARY.md),
especially its [anonymous identity terminology](GLOSSARY.md#anonymous-identity-terminology).
Changes to report handling or content review should follow the documented
[report and moderation states](moderation-state-machine.md). API error examples
and status-code meanings are in the [API Integration Guide](API_INTEGRATION.md#error-response-examples).

## Choosing Work

Before starting work, choose an open issue, check that it is not already
assigned, and look for an existing pull request that mentions the same issue
number or title. If the issue is unclear or broad, ask a maintainer to confirm
scope before opening a large PR.

## Local Setup

Run these commands from a fresh clone of the repository.

```bash
git clone https://github.com/Xconfess/Xconfess.git
cd Xconfess
npm install
```

Start the local infrastructure:

```bash
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
```

Copy the local environment templates:

```bash
cp xconfess-backend/.env.example xconfess-backend/.env
cp xconfess-frontend/.env.example xconfess-frontend/.env.local
```

The example files are intentionally safe for local development. Do not commit
.env` or `.env.local`, and do not paste private keys, tokens, passwords, or
production credentials into issues, pull requests, screenshots, or logs.

For the purpose, expected local format, and secret-vs-config classification of
every backend and frontend variable, see the
[Local Environment Variables guide](environment-variables.md).

For a faster local UI workflow, you may add this value to
.xconfess-frontend/.env.local`:

```bash
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

## Running The App

Run the full stack from the repository root:

```bash
npm run dev
```

Or run one service at a time:

```bash
npm run dev:backend
npm run dev:frontend
```

Default local URLs:

- Frontend: http://localhost:3000
- Backend API: `http://localhost:5000`
- Live health check: `http://localhost:5000/api/health/live`
- Readiness health check: `http://localhost:5000/api/health/ready`
- Postgres: `localhost:55432`
- Redis: `localhost:6379`

## Stellar Testnet Development

Stellar and Soroban features are optional for local development. If your work
involves the embedded wallet, payments, or contracts, follow the dedicated
guide:

- [Stellar Testnet Development Guide](STELLAR_TESTNET_DEVELOPMENT.md)

It covers required configuration, testnet wallet prerequisites, safe key
handling, and how to disable Stellar features for normal local development.

## Branch Naming

Use a small, issue-focused branch name:

```bash
git checkout -b docs/contributor-guide
git checkout -b fix/comment-search-proxy
git checkout -b test/wave-demo-journey-smoke
```

Keep each branch scoped to one issue. Avoid unrelated formatting, generated
files, dependency upgrades, or cleanup unless the issue explicitly asks for them.

## Validation Commands

Run the smallest relevant check while developing, then run the full CI command
before opening the pull request when practical.

```bash
# Backend only
npm run backend:build
npm run backend:lint
npm run backend:test

# Frontend only
npm run frontend:lint
npm run frontend:test
npm run frontend:build

# Contracts only
npm run contract:fmt:check
npm run contract:lint
npm run contract:test
npm run contract:build:release

# Full repository check
npm run ci
```

If a full check cannot run locally because a dependency, Docker service, or
platform tool is unavailable, document the failed command and the exact blocker
in the pull request body.

## Database Migrations

xConfess uses TypeORM migrations to manage the Postgres schema. There are two
migration directories:

- `xconfess-backend/migrations/` — historical and feature migrations.
- `xconfess-backend/src/migrations/` — newer in-source migrations.

Both directories are loaded by the TypeORM CLI and the app at startup.

### Show pending migrations

```bash
npm run backend:migration:show
```

This prints the list of all migrations and which ones have already run in the
connected database. Check that it completes without TypeORM class-name errors
Before opening a migration-related PR.

### Run pending migrations (clean database)

For a fresh Postgres database — for example, a new Docker container — run all
pending migrations in order:

```bash
npm run backend:migration:run
```

This is the standard path for CI, staging, and production deployments.

### Repair a local synchronized database

If your local database was bootstrapped with TypeORM `synchronize: true` (the
old default for dev), the schema may be missing columns or indexes that
migrations add. **Use the repair command instead of blowing away your database:**

```bash
npm run backend:schema:repair
```

This script is idempotent and data-safe. It adds any missing
`anonymous_confessions` columns and indexes and backfills `search_vector` for
existing rows. It must only be used locally — never in staging or production.

### Verify schema readiness

After either path, confirm the readiness probe returns 200:

```
GET http://localhost:5000/api/health/ready
```

If the schema check is still failing, the response body includes `missingColumns`,
`missingIndexes`, and a `hint` with the exact command to run.

## Data Export Workflow

This section documents the current data export feature and the responsibilities
of the API, the queue, and the generated artifacts.

### Request Lifecycle

Data exports are asynchronous. A single request follows this path:

1. **Create** — A client calls the export creation endpoint on the backend
   API. The API validates the requested export type and filters, checks the
   caller's authorization for the target data, and persists an export job
   record with a `pending` status.
2. **Enqueue** — The API enqueues the job on the export queue (Redis-backed
)   with the job ID and the authorized scope. The API returns the job ID and
   a status endpoint to the client immediately; it does not wait for the
   export to finish.
3. **Process** — A queue worker consumes the job, re-checks authorization,
   queries the data within the job's scope, and writes the result to a generated
   artifact. The worker updates the job to `completed` or `failed` with an
   error message.
4. **Retrieve** — The client polls the status endpoint. Once the job is
   `completed`, the API serves a download link or stream for the generated
   artifact, gated by the same authorization checks.
5. **Expire** — Generated artifacts and their job records are retained for a
   bounded window and then cleaned up by the export cleanup job.

### Responsibilities

- **API** — Authenticates the caller, authorizes the requested scope,
  validates filters, creates the job record, enqueues the job, and serves status
  and download responses. The API must never bypass authorization checks on
  download.
- **Queue** — Owns job dispatch, retries, and failure handling. Workers must be
  idempotent and must re-validate the job's scope before writing any data.
  Failed jobs must record an error message that is safe to return to the
  client.
- **Generated artifacts** — Export files are written to the configured
  export storage location and are named by job ID. Artifacts must not be
  committed to the repository and must not be shared in issues or pull requests.

### Local Testing

Run the backend and the Docker services from the repository root, then exercise
the export flow end to end:

1. Start infrastructure and the backend:

   ```bash
   docker compose -f compose.yaml up -d
   npm run dev:backend
   ```

2. Create an export job through the API with a valid auth token and the
   export type you are testing. Record the returned job ID.

3. Poll the status endpoint until the job reaches `completed` or `failed`.
   Confirm the status transitions from `pending` to a resolved state.

4. Download the artifact and verify the contents match the requested scope
   and filters.

5. Run the relevant automated checks before opening a pull request:

   ```bash
   npm run backend:lint
   npm run backend:test
   ```

Tests that cover exports should assert the job lifecycle, authorization
enforcement, and artifact content. Use seeded or synthetic data only; never use
real user data in local tests or fixtures.

### Cleanup Expectations

- Export job records and generated artifacts are retained only for the
  configured retention window.
- The export cleanup job removes expired artifacts from storage and marks the
  corresponding job records as expired. Contributors must not disable or shorten
  this cleanup without maintainer approval.
- Local developers should delete any export artifacts they generate during
  testing once they are done, and must not commit them to the repository.
- Any change to retention or cleanup behavior must include tests covering
  expiration and must be called out in the pull request body.

### Privacy-Safe Handling

- Exports contain user data. Treat every generated artifact as sensitive.
- Do not attach export files, export logs, or job payloads to issues or pull
  requests. If you must share a sample, redact identifying fields and use
  synthetic data.
- Never log raw export contents, auth tokens, or personal data. Log only the
  job ID, status, and non-identifying error codes.
- Enforce authorization on every status and download request; do not rely on
  job ID secrecy for access control.
- Follow the redaction rules in
  [Attaching logs to issues and PRs](LOG_ATTACHING_GUIDE.md) when sharing
  any export-related output.

## Pull Request Checklist

Your pull request should include:

- A short summary of what changed.
- The validation commands you ran and their results.
- Screenshots for visible UI changes.
- Any known limitations or follow-up work.
- A closing keyword that links the issue.

Use this format in the pull request body so GitHub can connect the work to the
issue:

```md
Closes #1118
[```

Replace `1118` with the actual issue number you are solving. Do not omit the
closing keyword when the PR resolves an issue.

## Review Handoff

When the PR is ready, use the ready-for-review template:

- [Wave 5 ready-for-review template](WAVE_5_READY_FOR_REVIEW_TEMPLATE.md)

If your PR includes logs or screenshots, follow the redaction rules:

- [Attaching logs to issues and PRs](LOG_ATTACHING_GUIDE.md)

Never include production secrets, private keys, real user data, or KYC/payment
information in repository artifacts.
