#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_API_ROOT = path.join(ROOT, 'xconfess-frontend', 'app', 'api');

function normalizePath(value) {
  let result = String(value)
    .replace(/\$\{[^?}]*\?[\s\S]*$/, '')
    .replace(/\?.*$/, '')
    .replace(/\\/g, '/');
  result = result.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, '{$1}');
  result = result.replace(/\[\.\.\.([^\]]+)\]/g, '{$1}').replace(/\[([^\]]+)\]/g, '{$1}');
  if (!result.startsWith('/')) result = `/${result}`;
  if (result.startsWith('/api/')) result = result.slice(4);
  return result.length > 1 ? result.replace(/\/$/, '') : result;
}

function collectRouteFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectRouteFiles(fullPath, files);
    else if (entry.name === 'route.ts') files.push(fullPath);
  }
  return files;
}

function routeMethodAt(source, offset) {
  const prefix = source.slice(0, offset);
  const matches = [...prefix.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
  return matches.at(-1)?.[1] || null;
}

function readRouteArgument(source, start) {
  const openParen = source.indexOf('(', start);
  if (openParen < 0) return null;
  let comma = openParen + 1;
  let depth = 0;
  while (comma < source.length) {
    const char = source[comma];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) break;
    comma += 1;
  }
  let cursor = comma + 1;
  while (/\s/.test(source[cursor] || '')) cursor += 1;
  const quote = source[cursor];
  if (!['"', "'", '`'].includes(quote)) return null;
  const valueStart = cursor + 1;
  cursor = valueStart;
  let expressionDepth = 0;
  while (cursor < source.length) {
    if (source[cursor] === '\\') { cursor += 2; continue; }
    if (quote === '`' && source.startsWith('${', cursor)) {
      expressionDepth += 1;
      cursor += 2;
      continue;
    }
    if (expressionDepth > 0) {
      if (source[cursor] === '{') expressionDepth += 1;
      else if (source[cursor] === '}') expressionDepth -= 1;
      cursor += 1;
      continue;
    }
    if (source[cursor] === quote) {
      return { value: source.slice(valueStart, cursor), end: cursor + 1 };
    }
    cursor += 1;
  }
  return null;
}

function extractProxyRoutes(source, filePath = '') {
  const routes = [];
  const pattern = /resolveBackendRoute\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const argument = readRouteArgument(source, match.index);
    if (!argument) continue;
    const nextProxyCall = source.indexOf('resolveBackendRoute', argument.end);
    const callTail = source.slice(argument.end, nextProxyCall < 0 ? argument.end + 1200 : nextProxyCall);
    const explicitMethod = callTail.match(/method\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i)?.[1]?.toUpperCase();
    routes.push({
      path: normalizePath(argument.value),
      method: explicitMethod || routeMethodAt(source, match.index),
      filePath,
    });
  }
  return routes.filter((route) => route.method && route.path);
}

function collectFrontendProxyRoutes(frontendApiRoot = FRONTEND_API_ROOT) {
  const routes = [];
  for (const filePath of collectRouteFiles(frontendApiRoot)) {
    routes.push(...extractProxyRoutes(fs.readFileSync(filePath, 'utf8'), path.relative(ROOT, filePath)));
  }
  return routes;
}

function validateApiContract({ spec, proxyRoutes }) {
  const errors = [];
  const paths = spec?.paths;
  if (!paths || typeof paths !== 'object') return ['OpenAPI document does not contain a paths object.'];

  const operations = new Set();
  for (const [rawPath, item] of Object.entries(paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (item && item[method]) operations.add(`${method.toUpperCase()} ${normalizePath(rawPath)}`);
    }
  }

  const seen = new Set();
  for (const route of proxyRoutes) {
    const operation = `${route.method} ${route.path}`;
    if (seen.has(operation)) continue;
    seen.add(operation);
    if (!operations.has(operation)) {
      errors.push(`${operation} is referenced by ${route.filePath} but is missing from the backend OpenAPI contract.`);
    }
  }
  return errors;
}

function main() {
  const specPath = process.argv.find((arg) => arg.startsWith('--spec='))?.slice('--spec='.length) || process.env.OPENAPI_SPEC_PATH;
  if (!specPath) throw new Error('Provide an OpenAPI JSON file with --spec=/path/to/openapi.json or OPENAPI_SPEC_PATH.');
  const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), 'utf8'));
  const errors = validateApiContract({ spec, proxyRoutes: collectFrontendProxyRoutes() });
  if (errors.length) {
    console.error('Frontend proxy/API contract drift detected:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Frontend proxy/API contract drift check passed.');
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}

module.exports = { extractProxyRoutes, normalizePath, validateApiContract };
