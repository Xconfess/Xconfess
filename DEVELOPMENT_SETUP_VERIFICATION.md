# Development Setup Verification

This document verifies that all acceptance criteria for Stellar Wave issues #1829, #1828, #1827, and #1826 have been met.

## Issue #1829: Create env bootstrap script for local development

**Acceptance Criteria:**
- ✅ Script creates `xconfess-backend/.env` when absent
- ✅ Script creates `xconfess-frontend/.env.local` when absent  
- ✅ Script never overwrites existing env files
- ✅ README quick start references the script..

**Implementation:**
- **Script**: `scripts/bootstrap-env.js`
  - Copies `.env.example` → `.env` for backend (only if absent)
  - Copies `.env.example` → `.env.local` for frontend (only if absent)
  - Uses `fs.constants.COPYFILE_EXCL` flag to prevent overwrites
  - Prints guided next steps for required secrets
- **Integration**: 
  - npm script: `npm run env:bootstrap`
  - Referenced in README.md (line 44-45, 97-105)
  - Referenced in QUICK_START.md (line 44)

**Verification**:
```bash
$ npm run env:bootstrap
> env:bootstrap
> node scripts/bootstrap-env.js

CREATE xconfess-backend/.env from xconfess-backend/.env.example
CREATE xconfess-frontend/.env.local from xconfess-frontend/.env.example

Next required local backend values:
- JWT_SECRET: any 32+ character local-only random string
- APP_SECRET: any 32+ character local-only random string
- CONFESSION_ENCRYPTION_KEY: 64 hex characters
- ENCRYPTION_MASTER_KEY_v1: 64 hex characters

The checked-in .env.example values are safe placeholders for local boot only.
```

---

## Issue #1828: Add a preflight check for unsupported local Node majors

**Acceptance Criteria:**
- ✅ Running preflight on unsupported Node major fails fast
- ✅ Message states expected version and current version
- ✅ Existing dev:check behavior remains focused on local services

**Implementation:**
- **Script**: `scripts/check-node-version.js`
  - Validates Node.js version is exactly 22.x
  - Validates npm version is >= 9
  - Prints expected vs. current version on failure
  - Provides actionable remediation (nvm, fnm, volta)
  - Specifically mentions npm.cmd for PowerShell issues
- **Integration**:
  - npm script: `npm run setup:check`
  - Called in contributor quick start in README.md
  - Separate from `dev:check` (which remains focused on Postgres/Redis)

**Verification**:
```bash
$ npm run setup:check
> setup:check
> node scripts/check-node-version.js

Runtime preflight passed: Node v22.21.1, npm 10.9.4.
```

---

## Issue #1827: Add Windows-friendly npm command guidance

**Acceptance Criteria:**
- ✅ Windows setup docs include npm.ps1 failure mode
- ✅ Workaround uses npm.cmd examples (no system-wide policy changes)
- ✅ Clear, actionable guidance

**Implementation:**
- **Documentation**:
  - README.md (lines 66-72): Explicit PowerShell block notice with npm.cmd workaround
  - QUICK_START.md (line 47): Windows PowerShell guidance for npm.cmd
  - Error output from check-node-version.js (line 36): "On PowerShell policy errors, run npm commands as npm.cmd"

**Sample Text from README.md**:
```markdown
If PowerShell blocks `npm.ps1` with an execution-policy error, use `npm.cmd` for local commands without changing machine-wide policy:

```powershell
npm.cmd --version
npm.cmd install
npm.cmd run env:bootstrap
```
```

---

## Issue #1826: Align documented Node engine with package engine constraints

**Acceptance Criteria:**
- ✅ Fresh install instructions name one supported Node version range
- ✅ npm install no longer surprises with contradictory guidance
- ✅ CI uses the same major version documented for contributors

**Implementation:**
- **package.json**:
  - Line 10: `"node": "22.x"`
  - Line 11: `"npm": ">=9.0.0"`
- **README.md**:
  - Line 40: `Node.js 22.x and npm >= 9`
  - Consistent throughout all instructions
- **QUICK_START.md**:
  - Line 9: `Node.js | 22.x | Backend + Frontend`
  - Prerequisites table clearly states 22.x
- **CI Configuration** (all using 22):
  - `.github/workflows/ci.yml`: `node-version: 22`
  - `.github/workflows/cd.yml`: `node-version: 22`
  - `.github/workflows/release-gate.yml`: `node-version: 22`

**Documentation Consistency**:
- ✅ README, QUICK_START, package.json, and CI workflows all specify **Node 22.x**
- ✅ No conflicting version guidance
- ✅ Contributors will not see npm engine warnings about version mismatch

---

## Quick Start Verification

The complete contributor flow now works seamlessly:

```bash
npm install                    # Root dependencies + engine check
npm run setup:check            # Validates Node 22.x + npm 9+
npm run env:bootstrap          # Creates .env files from examples
npm run dev:services           # Starts Postgres + Redis
npm run dev:check              # Verifies services are ready
npm run dev                    # Starts backend + frontend
```

On Windows with PowerShell restrictions:
```powershell
npm.cmd install
npm.cmd run setup:check
npm.cmd run env:bootstrap
npm.cmd run dev:services
npm.cmd run dev:check
npm.cmd run dev
```

All four issues are now fully resolved and verified.
