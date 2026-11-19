# Fixture Authoring Guide

Fixtures must look realistic enough to catch real bugs while containing nothing that could
harm a user if the repository is public, forked, or archived. This guide defines the safe
building blocks; the machine-readable source of truth is
[`scripts/fixtures/synthetic-identities.json`](../scripts/fixtures/synthetic-identities.json).

---

## 1. Safe synthetic identities and content patterns

Use these values (or values that follow the same pattern) in every backend, frontend, and
contract fixture:

| Field | Safe pattern | Example |
|---|---|---|
| Username | `seed_`, `fixture_`, or `test_` prefix | `seed_alice`, `fixture_moderator` |
| Email | username in an allowlisted test domain | `seed_alice@example.test` |
| Display name | starts with `Fixture` or `Test` | `Fixture Alice` |
| Confession / message body | `Fixture <thing> <n>: synthetic content ...` | `Fixture confession 1: synthetic content for local tests only.` |
| Stellar secret placeholder | `S` followed by 55 `X` characters | `SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| Contract / account ID placeholder | `C` or `G` followed by 55 `X` characters | `CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| Encryption key | repeated single hex digit (64 chars) | `0000...0000` |
| Password | documented dummy value | `fixture-password-not-a-real-secret` |

The policy also lists allowed API-key placeholders (`sk-proj-REDACTED`, `ghp-REDACTED`,
`sk_live-REDACTED`, `[REDACTED_JWT]`) for fixtures that need a credential-shaped field.
Never put a real credential behind one of these labels.

**Content rules**

- Fixed strings over random prose: deterministic assertions beat realistic noise.
- Fix the shape (length, unicode, whitespace) but not someone else's words.
- Never copy production payloads, bug reports, support tickets, or chat logs into fixtures,
  even if names are removed.
- Test data belongs in fixtures; real data belongs in an access-controlled environment.

---

## 2. Prohibited values and redaction rules

These values are prohibited in fixtures and test code:

- Real credentials: private keys, Stellar secret seeds, JWTs, provider API keys, GitHub PATs,
  AWS secret keys, live payment keys.
- Real personal data: names, emails outside the allowed test domains, phone numbers, postal
  addresses, government IDs, IP addresses, wallet addresses tied to a real person.
- Real infrastructure: production hostnames, internal URLs, customer subdomains.
- Template confusion: a value that *looks* allowlisted but is a real secret with a suffix.

**Redaction rules**

1. Delete the real value and replace it with the matching allowlisted placeholder from the
   policy. Do not encode, truncate, or comment it out.
2. If the value was ever real, rotate it first — a published credential must be considered
   compromised even after removal (`docs/incident-response-leaked-secrets.md`).
3. Keep the shape needed by the test (length, prefix, JSON type) using synthetic characters.
4. Never add the real value to a "why this was redacted" comment or commit message.
5. Regenerate any build artifact produced before redaction; bundles can retain old strings.

The same allowlist is enforced by the artifact scanner in
[`docs/release-artifact-secret-scanning.md`](./release-artifact-secret-scanning.md).

---

## 3. Validate fixtures

```bash
npm run fixtures:validate              # policy + all scripts/fixtures/*.json
npm run fixtures:validate:self-test    # prove the validator catches bad values
npm run fixtures:test                  # unit tests for the policy and validator
npm run secret-scan                    # repo-wide secret preflight
npm run artifacts:scan                 # release artifacts and Docker context
```

Additional files can be checked explicitly:

```bash
node scripts/validate-fixtures.js --file=path/to/your.fixture.json
```

CI runs `fixtures:validate` and the artifact scanner in the **Security / Secret Scan** job.

---

## 4. Examples

### Backend (Jest)

```ts
// xconfess-backend/src/confession/__tests__/confession.fixture.spec.ts
const fixtureUser = {
  username: 'seed_alice',
  email: 'seed_alice@example.test',
  displayName: 'Fixture Alice',
  password: 'fixture-password-not-a-real-secret',
};

const fixtureConfession = {
  body: 'Fixture confession 1: synthetic content for local tests only.',
  category: 'technology',
};

it('creates a confession for a synthetic user', async () => {
  const result = await confessionsService.create(fixtureUser, fixtureConfession);
  expect(result).toMatchObject({ body: fixtureConfession.body });
});
```

### Frontend (Jest + React Testing Library)

```tsx
// xconfess-frontend/src/components/__tests__/author-line.fixture.spec.tsx
const fixtureSession = {
  username: 'fixture_moderator',
  email: 'fixture_moderator@example.test',
  displayName: 'Fixture Moderator',
  accountId: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
};

it('renders the fixture display name', () => {
  render(<AuthorLine session={fixtureSession} />);
  expect(screen.getByText('Fixture Moderator')).toBeInTheDocument();
});
```

### Contract tests (Rust)

```rust
// xconfess-contracts/contracts/tests/fixture_ids.rs
const FIXTURE_CONTRACT_ID: &str = "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const FIXTURE_SOURCE_ALIAS: &str = "fixture-deployer";

#[test]
fn fixture_metadata_uses_placeholders() {
    assert!(FIXTURE_CONTRACT_ID.starts_with('C'));
    assert!(FIXTURE_CONTRACT_ID[1..].chars().all(|c| c == 'X'));
    assert_eq!(FIXTURE_SOURCE_ALIAS, "fixture-deployer");
}
```

These values are intentionally all-X placeholders so they can never be mistaken for real
deployed contract IDs. Use real IDs only in `deployments/<network>.json`, whose validation
rules are documented in
[`docs/contract-release-and-upgrade-runbook.md`](./contract-release-and-upgrade-runbook.md#deployment-metadata-validation-rules).

---

## 5. Contributor checklist

- [ ] Identities use allowed prefixes and test email domains.
- [ ] Content starts with `Fixture` or `Test` and contains no copied real text.
- [ ] Credential-shaped fields use allowlisted placeholders.
- [ ] `npm run fixtures:validate` and `npm run fixtures:test` pass.
- [ ] No real key, token, address, or personal detail appears in the diff.
