# Wave 5 Contributor FAQ

Welcome to XConfess Wave 5! This guide answers common questions about contributing to this wave.

## Setup & Prerequisites

**Q: What do I need to get started?**

A: You'll need:
- Node.js ≥ 18 and npm ≥ 9
- Docker (for PostgreSQL and Redis)
- Git and a GitHub account
- A code editor (VS Code recommended)

For contract work, you'll also need Rust and `cargo`. See [SOROBAN_SETUP.md](SOROBAN_SETUP.md) for details.

**Q: How do I set up the project locally?**

A: Follow the [README.md](../README.md) local development section:
1. Clone the repo and run `npm install`
2. Start services: `docker compose -f compose.yaml up -d`
3. Configure environment files (`.env.local` in frontend, `.env` in backend)
4. Start the backend: `npm run dev --workspace=xconfess-backend`
5. Start the frontend: `npm run dev --workspace=xconfess-frontend`

For more details, see [QUICK_START.md](../QUICK_START.md).

## Assignment & Scope

**Q: How do I know what to work on?**

A: You'll be assigned a specific issue with clear acceptance criteria. Issues are labeled with complexity (Trivial/Medium/High). Start with the acceptance criteria and ask questions if the scope is unclear.

**Q: What if the scope doesn't match my expectations?**

A: Comment on the issue or reach out to the maintainers. Wave 5 issues are designed to be focused and achievable. If you need the scope adjusted, we can split it into smaller issues.

## Testing & Validation

**Q: Do I need to run tests before submitting a PR?**

A: Yes. Run the test suite for your changes:
- Backend: `npm run test --workspace=xconfess-backend`
- Frontend: `npm run test --workspace=xconfess-frontend`
- Contracts: `cargo test --workspace` (from `xconfess-contracts/`)

Make sure all tests pass and the build succeeds:
- Frontend build: `npm run build --workspace=xconfess-frontend`
- Backend: `npm run build --workspace=xconfess-backend`

**Q: How do I verify my changes work end-to-end?**

A: Test locally with the full stack running. For UI changes, test on both desktop and mobile. For backend changes, use the admin endpoints or test the affected flow manually.

## PR & Review Expectations

**Q: What should my PR look like?**

A: Keep PRs focused on the issue scope. Include:
- A clear title referencing the issue (e.g., `#1055: Add Wave 5 contributor FAQ`)
- A brief description of what changed and why
- Any relevant testing notes
- Links to related documentation if applicable

Commit messages should be clear and reference the issue number.

**Q: How long does review take?**

A: Maintainers aim to review within 24–48 hours. Be responsive to feedback and questions. If you're blocked waiting for a review, ask in the issue comments.

## Getting Help

**Q: What if I'm stuck?**

A: Don't hesitate to ask! Options:
- Comment on the issue with your question
- Tag a maintainer (`@Mosas2000`) if it's urgent
- Check the [Wave 5 Roadmap](../WAVE_5_ROADMAP.md) for context on the overall goals

We're here to help you succeed. Asking early beats being blocked.

**Q: Where do I find documentation?**

A: Start here:
- [README.md](../README.md) — Project overview and local setup
- [QUICK_START.md](../QUICK_START.md) — Fast onboarding guide
- [WAVE_5_ROADMAP.md](../WAVE_5_ROADMAP.md) — Wave 5 goals and context
- `docs/` folder — Technical guides and runbooks
- Issues and PRs — Real examples of completed work

## Redacting Sensitive Information

**Q: What if I need to include logs or errors in my PR?**

A: Always redact sensitive data before sharing:
- Remove tokens, API keys, and private keys
- Redact user IDs, emails, and personal identifiable information (PII)
- Keep request IDs and timestamps when they're helpful for debugging

For example:
```
❌ Bad:
Error: Connection refused to user@example.com at token=sk_live_abc123xyz

✓ Good:
Error: Connection refused to [USER_EMAIL] at token=[REDACTED_TOKEN]
```

See [CONTRIBUTOR_LOGS_GUIDE.md](CONTRIBUTOR_LOGS_GUIDE.md) for detailed examples.

---

**Still have questions?** Open an issue or ask in the PR comments. Happy contributing!
