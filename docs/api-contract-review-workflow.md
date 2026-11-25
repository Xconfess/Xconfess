# API Contract Review Workflow

Backend API changes must be visible during pull-request review. CI generates a normalized
OpenAPI document from the running backend, compares it with a committed baseline, and writes
a classified change report to the job summary. Breaking changes fail the check.

---

## 1. Generate a normalized document

The backend exposes its OpenAPI document at `GET /api/docs-json`. CI starts the backend,
waits for `/api/health/live`, then fetches the spec and normalizes it:

```bash
# What CI runs (locally, start the backend first):
curl --fail --silent http://127.0.0.1:5000/api/docs-json > openapi.json
npm run api:contract:normalize -- --spec=openapi.json --output=deployments/openapi.normalized.json
```

`scripts/lib/openapi-contract.js` normalization:

- removes `servers`, `externalDocs`, `contact`, and `termsOfService` at every level, so
  environment-specific hosts never enter the document;
- redacts emails, URLs, IPs, JWTs, API keys, private-key blocks, and Stellar keys with stable
  placeholders such as `<email>` and `<url>`;
- normalizes path syntax (`${id}`, `[id]`, `[...slug]` → `{id}`) and strips the `/api` prefix;
- sorts all object keys so the SHA-256 digest is reproducible across runs.

The generated file `deployments/openapi.normalized.json` is a CI artifact and is gitignored.
It is not a baseline.

---

## 2. Compare against the baseline and classify changes

The committed baseline is `deployments/openapi-baseline.json`. CI runs:

```bash
npm run api:contract:check -- \
  --spec=openapi.json \
  --output=deployments/openapi.normalized.json \
  --report="$GITHUB_STEP_SUMMARY"
```

Every change is classified:

| Classification | Examples | CI result |
|---|---|---|
| **Breaking** | Removed operation, removed required property, new required property/parameter/body, changed type, removed enum value, removed 2xx response, removed media type, removed referenced component schema | Fails the check |
| **Non-breaking** | Added operation, added optional property, added enum value, relaxed `required`, added response/media type | Passes, shown in report |
| **Informational** | Operation ID or format changed, operation deprecated | Passes, shown in report |

The report includes both normalized digests, a count table, and a bullet for every change.
Reviewers see it directly in the PR's **Checks → CI / Apps** summary. Use
`--allow-breaking` locally to inspect a breaking diff without failing the command; it is
never used in CI.

### Baseline provenance

The current baseline is a **proxy-derived seed** (`x-baseline-metadata.seed = true`) built
from the frontend proxy routes that CI already validates against the backend. It covers the
operations real clients depend on and is intentionally marked as a seed. The report says so
explicitly, and adding operations is non-breaking. Capture the full contract with the update
workflow below before treating the baseline as complete.

---

## 3. Explicit update workflow

A baseline change is a contract decision, not a cleanup task. Update it only when the diff is
reviewed and intentional:

1. Generate the spec from the reviewed backend commit.
2. Run the checker and read the classified report:
   ```bash
   npm run api:contract:check -- --spec=openapi.json --report=/tmp/api-contract-review.md
   ```
3. If every breaking change is intended, update the baseline:
   ```bash
   npm run api:contract:update -- --spec=openapi.json
   ```
4. Review the diff and confirm no environment-specific hosts or secrets appear:
   ```bash
   git diff -- deployments/openapi-baseline.json
   ```
5. Commit the baseline in the **same PR** as the code change and mention the breaking changes
   in the PR description. `--update` records `updated_at_utc`, the normalized digest, and the
   generating command in `x-baseline-metadata`.

To regenerate the seed from frontend proxies (for example after adding a proxy route during
initial setup):

```bash
npm run api:contract:seed
```

---

## 4. Safety notes

- Never paste a raw `openapi.json` into a PR description or issue: it may contain internal
  hosts or example tokens. Use the normalized report instead.
- The normalization rules are shared with fixture and artifact secret checks conceptually,
  but the baseline itself must contain no credentials. If a finding appears, redact it at the
  source DTO/example rather than editing the baseline by hand.
- Environment-specific values belong in `docs/environment-variables.md`, not in the contract.

---

## 5. Local commands

```bash
npm run api:contract:test                 # classification + CLI unit tests
npm run api:contract-drift -- --spec=...  # frontend proxy vs backend spec
npm run api:contract:check -- --spec=...  # baseline comparison (CI parity)
npm run api:contract:update -- --spec=... # explicit baseline update
```
