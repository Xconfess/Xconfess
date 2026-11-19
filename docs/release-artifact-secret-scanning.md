# Release Artifact Secret Scanning

Credentials and private keys must never reach a deployable bundle, image context, or archive.
This check complements the repository-wide preflight in
[`docs/incident-response-leaked-secrets.md`](./incident-response-leaked-secrets.md) by scanning
the *built* outputs that are actually shipped.

---

## 1. What is scanned

`scripts/scan-artifacts.js` collects and scans:

| Area | Paths |
|---|---|
| Backend bundle | `xconfess-backend/dist/**` |
| Frontend bundle | `xconfess-frontend/.next/**`, `out/**`, `build/**` |
| Docker build context | `Dockerfile.backend`, `Dockerfile.frontend`, `compose.yaml`, `render.yaml` |
| Contract release artifacts | `xconfess-contracts/target/**/release/*.wasm` (binary bytes) |
| Deployment metadata | `deployments/**` |
| Fixture policy | `scripts/fixtures/**` |
| Archives | `*.zip`, `*.tar`, `*.gz`, `*.tgz`, `*.7z`, `*.bz2` anywhere in the tree |
| Env files | `.env*` in the repo root and both workspaces (except `.example`/`.sample`) |

Binary files are decoded as `latin1` so embedded string constants are still detected. Files
larger than 64 MB are skipped with an explicit notice. Directories such as `node_modules`,
`.git`, and `coverage` are pruned.

High-confidence rules detect: PEM private-key blocks, checksum-valid Stellar secret seeds,
JWTs, OpenAI/Anthropic keys, Stripe live keys, GitHub PATs, and AWS secret access keys.
Stellar seeds are validated with the StrKey CRC16 checksum, so random uppercase runs in WASM
do not create false positives.

---

## 2. Allowed synthetic values only

The allowlist is loaded from `scripts/fixtures/synthetic-identities.json` — the same policy
used by the fixture validator. Only documented placeholders such as
`SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`, `sk-proj-REDACTED`,
`[REDACTED_JWT]`, and the test-domain emails from the fixture guide are exempt. See
[`docs/fixture-authoring-guide.md`](./fixture-authoring-guide.md#2-prohibited-values-and-redaction-rules)
for the full rules. There is no per-file skip list and no environment variable that widens
the allowlist.

---

## 3. Commands

```bash
npm run artifacts:scan              # scan the current checkout / built artifacts
npm run artifacts:scan -- --path=/path/to/other/root
npm run artifacts:scan -- --json
npm run artifacts:scan:self-test    # prove detection on synthetic release secrets
npm run artifacts:test              # unit tests for the scanner
```

### CI enforcement

- **Security / Secret Scan** scans the committed Docker context and deployment metadata and
  runs the scanner self-test before any build job.
- **Apps** scans `xconfess-backend/dist` and `xconfess-frontend/.next` after `npm run ci:apps`
  builds them.
- **Contracts** rebuilds release WASM via `scripts/contracts-release.sh check`, then scans
  the release artifacts.

Any high-confidence finding makes the step and the job fail.

---

## 4. Safe remediation

A finding reports the rule, redacted match, and a rule-specific fix. In every case:

1. **Do not** copy the matched value into an issue, PR comment, or commit message.
2. Remove it from the *source* that produced the artifact — not just from the artifact.
   Bundlers and archives retain strings from earlier inputs.
3. Replace it with an allowlisted placeholder from the fixture policy, or load it at runtime
   from the deployment secret store.
4. Rotate/revoke anything that was ever a real credential. Treat a published secret as
   compromised, then follow
   [`docs/incident-response-leaked-secrets.md`](./incident-response-leaked-secrets.md).
5. If a secret was copied into a Docker build context, add the file to `.dockerignore` and
   rebuild the image from a clean context.
6. Rebuild the affected bundle or archive, then rerun `npm run artifacts:scan` until it
   reports zero findings.

Rule-specific guidance:

| Rule | Safe fix |
|---|---|
| `private-key-block` | Remove the PEM block; keep keys in a secret manager; rotate if published. |
| `stellar-secret-seed` | Remove the StrKey seed; load from secret storage; revoke the account and move funds. |
| `jwt` | Never bake tokens into artifacts; inject at runtime and invalidate the token. |
| `openai-api-key` | Revoke and rotate; supply through the deployment secret store. |
| `stripe-live-key` | Rotate immediately; use test keys or `[REDACTED]` in fixtures. |
| `github-pat` | Revoke in developer settings; use short-lived installation tokens. |
| `aws-secret-key` | Rotate the key pair; use environment variables or an instance role. |

If a finding is a false positive, fix the detector or add a *documented* synthetic placeholder
to the policy in a reviewed PR. Do not weaken a pattern or add an ad-hoc skip to make CI pass.
