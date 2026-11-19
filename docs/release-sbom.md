# Release Software Bill of Materials

## Inventory format

Release SBOMs are CycloneDX 1.5 JSON documents. They contain runtime npm components for the backend and frontend, including package name, resolved version, and declared license where available. Secrets, environment values, source files, and private configuration are excluded.

Generated files:

- `artifacts/sbom/xconfess-backend.cyclonedx.json`
- `artifacts/sbom/xconfess-frontend.cyclonedx.json`

## Regenerate locally

```bash
npm ci
npm run sbom:generate
```

The command reads the locked dependency tree and installed package metadata. Review the generated component list and license fields during dependency or release review. Unknown licenses must be investigated rather than silently approved.

## CI release attachment

CI and CD attach the backend/frontend SBOM files to workflow artifacts or release outputs. CD uploads `xconfess-release-sboms-<run_id>` with the application artifacts. Preserve artifact run IDs and retain matching SBOM and application versions.

## Review checklist

- The SBOM names both release components and resolved versions.
- Package licenses are present or marked `UNKNOWN` for follow-up.
- No `.env`, private keys, credentials, database strings, or customer data are present.
- Dependency changes match `package.json`/`package-lock.json` review.
- Review findings are escalated to the Backend, Frontend, or Security owner as applicable.

For rollback and incident ownership, follow the [Incident Rollback Runbook](./incident-rollback-runbook.md).
