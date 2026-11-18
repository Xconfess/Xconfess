# Contributing Guidelines

Thank you for contributing! Please follow existing conventions and verify tests locally before opening PRs.

## Documentation

- [Contributor Guide](docs/CONTRIBUTOR_GUIDE.md) — local setup, branch naming, validation commands, and review handoff.
- [Local Environment Variables](docs/environment-variables.md) — purpose, expected local format, and secret-vs-config classification for every backend and frontend environment variable.
- [Glossary](docs/GLOSSARY.md#anonymous-identity-terminology) — canonical anonymous identity and session terminology.
- [API Integration Guide](docs/API_INTEGRATION.md#error-response-examples) — current API error response examples and status codes.
- [Report and Moderation States](docs/moderation-state-machine.md) — report statuses, moderation transitions, and guarded moderator actions.
- [Frontend Proxy Route Compatibility](docs/frontend-proxy-routes.md#compatibility-policy-2232) — what counts as a breaking change between backend endpoints and App Router proxies, deprecation handling, and a checklist for route changes.
- [Accessibility Checklist](docs/accessibility-checklist.md) — keyboard, focus, contrast, and screen-reader expectations for new UI components, plus a manual test checklist.
- [Critical Contract Review Delay Policy](docs/contract-review-delay-policy.md) — actions requiring a delay, gate enforcement, cancellation/clear events, and reviewer checklist.
- [API Contract Review Workflow](docs/api-contract-review-workflow.md) — normalized OpenAPI generation, breaking-change classification, and the explicit baseline update workflow.
- [Fixture Authoring Guide](docs/fixture-authoring-guide.md) — safe synthetic identities, prohibited values, validation commands, and examples for backend/frontend/contract tests.
- [Release Artifact Secret Scanning](docs/release-artifact-secret-scanning.md) — bundle/image/archive coverage, synthetic allowlist, CI failure policy, and remediation guidance.
