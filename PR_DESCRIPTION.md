# fix(backend): add field-level privacy controls to data export

## Description
This PR addresses issue #1451 by ensuring strict GDPR compliance in the data export functionality. It ensures the export includes only requester-owned data and properly redacts private counterpart identifiers from exported entities to prevent data leaks.

## Changes Included
- **`src/data-export/data-export.service.ts`**:
  - Expanded the `compileUserData` function to fetch and export `Tips`, `Reports`, and `ModerationLogs` belonging to the requesting user.
  - Added new redaction policies (`redactTipForExport`, `redactReportForExport`, `redactModerationLogForExport`) that mask counterpart identifiers (e.g., wallet addresses, resolver IDs, reviewer IDs) to `[REDACTED]`.
  - Ensured all exported data strips nested counterpart objects and explicitly flags elements for `counterpart_privacy`.
- **`src/data-export/data-export-redaction.spec.ts`**:
  - Added test fixtures for `Tips`, `Reports`, and `ModerationLogs`.
  - Verified that all counterpart identifiers are properly redacted before export generation.

## Acceptance Criteria Met
- [x] Export includes requester-owned data only.
- [x] Private counterpart identifiers are redacted.
- [x] Tests cover all sensitive entity types.

## How to Test
1. Run backend tests specifically targeting the data export module: `npm run backend:test -- --runTestsByPath src/data-export/*`
2. Validate that the tests pass and counterpart fields correctly return `[REDACTED]`.
3. Generate a sample export and verify that unrelated counterpart identities are hidden from the final payload.

Closes #1451
