#!/usr/bin/env node
/**
 * fix-lazy-getApiBaseUrl.js
 *
 * Moves `const X = getApiBaseUrl();` out of module scope (where `next build`
 * evaluates it during "Collecting page data" and crashes if BACKEND_API_URL
 * isn't set) into the top of every exported route handler in the same file
 * (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS), where it only runs per-request.
 *
 * Usage (from repo root):
 *   node scripts/fix-lazy-getApiBaseUrl.js
 *
 * Then verify:
 *   unset BACKEND_API_URL && npm run build --workspace=xconfess-frontend
 *
 * Safe by design:
 *   - Only touches files literally named `route.ts` (Next only treats those
 *     as route handlers — .example.ts files and app/api/client.ts are
 *     skipped automatically since they don't match this glob).
 *   - Only removes a TOP-LEVEL (column 0) `const X = getApiBaseUrl();` line
 *     — never touches one already inside a function.
 *   - Skips a file entirely (with a warning) if it can't find at least one
 *     exported handler to inject into, rather than silently corrupting it.
 *
 * NOT fully safe against:
 *   - A file where the var is *also* used inside a top-level helper
 *     function (not a route handler itself). After running this, run
 *     `npx tsc --noEmit` — TypeScript will report
 *     "Cannot find name 'BACKEND_URL'" for any such spot, which you then
 *     fix by hand (usually: pass the URL into the helper as a parameter).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "xconfess-frontend", "app", "api");

const MODULE_SCOPE_DECL = /^const (\w+) = getApiBaseUrl\(\);\n/m;

// Matches `export async function GET(...) {` and
// `export const GET = async (...) => {` style handlers.
const HANDLER_PATTERNS = [
  /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{/g,
  /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=\s*async\s*\([^)]*\)(?:\s*:\s*[^=]+)?\s*=>\s*\{/g,
];

function findRouteFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

function fixFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  const declMatch = original.match(MODULE_SCOPE_DECL);

  if (!declMatch) {
    return { filePath, status: "skipped-no-module-decl" };
  }

  const varName = declMatch[1];
  let withoutDecl = original.replace(MODULE_SCOPE_DECL, "");

  let handlerCount = 0;
  for (const pattern of HANDLER_PATTERNS) {
    withoutDecl = withoutDecl.replace(pattern, (match) => {
      handlerCount++;
      return `${match}\n  const ${varName} = getApiBaseUrl();`;
    });
  }

  if (handlerCount === 0) {
    return { filePath, status: "skipped-no-handlers-found", varName };
  }

  fs.writeFileSync(filePath, withoutDecl, "utf8");
  return { filePath, status: "fixed", varName, handlerCount };
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Could not find ${ROOT}. Run this from the repo root.`);
    process.exit(1);
  }

  const files = findRouteFiles(ROOT);
  const results = files.map(fixFile);

  const fixed = results.filter((r) => r.status === "fixed");
  const skipped = results.filter((r) => r.status !== "fixed");

  console.log(`\nFixed ${fixed.length} file(s):`);
  for (const r of fixed) {
    console.log(
      `  ✓ ${path.relative(process.cwd(), r.filePath)}  (${r.varName}, ${r.handlerCount} handler${r.handlerCount > 1 ? "s" : ""})`,
    );
  }

  const noModuleDecl = skipped.filter(
    (r) => r.status === "skipped-no-module-decl",
  );
  const noHandlers = skipped.filter(
    (r) => r.status === "skipped-no-handlers-found",
  );

  if (noHandlers.length > 0) {
    console.log(
      `\n⚠ Found the module-scope decl but no handler to inject into — fix by hand:`,
    );
    for (const r of noHandlers) {
      console.log(
        `  ! ${path.relative(process.cwd(), r.filePath)}  (var: ${r.varName})`,
      );
    }
  }

  console.log(
    `\n(${noModuleDecl.length} file(s) had no module-scope getApiBaseUrl() call — nothing to do.)`,
  );
  console.log(
    "\nNext: npx tsc --noEmit --project xconfess-frontend/tsconfig.json",
  );
  console.log(
    "Then: unset BACKEND_API_URL && npm run build --workspace=xconfess-frontend\n",
  );
}

main();
