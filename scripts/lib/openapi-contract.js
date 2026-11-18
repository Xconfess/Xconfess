#!/usr/bin/env node
'use strict';

/**
 * Normalized OpenAPI contract generation and baseline comparison.
 *
 * The document generated in CI is scrubbed of environment-specific hosts,
 * URLs, emails, and credential-shaped values, then sorted deterministically so
 * a hash is stable across runs. Comparison classifies each change as breaking,
 * non-breaking, or informational so reviewers can see the impact in PR checks.
 */

const crypto = require('crypto');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const OMITTED_KEYS = new Set(['servers', 'externalDocs', 'contact', 'termsOfService']);
const MAX_SCHEMA_DEPTH = 12;

const SANITIZERS = [
  [/-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g, '<private-key>'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<jwt>'],
  [/\bsk-(?:proj-|ant-)?[a-zA-Z0-9_-]{24,}\b/g, '<api-key>'],
  [/\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g, '<api-key>'],
  [/\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})\b/g, '<token>'],
  [/\bS[2-7A-Z]{55}\b/g, '<stellar-key>'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>'],
  [/https?:\/\/[^\s"'<>)\]]+/gi, '<url>'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>'],
];

function sanitizeString(value) {
  let result = String(value);
  for (const [regex, replacement] of SANITIZERS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

function normalizePath(value) {
  let result = String(value || '')
    .split('?')[0]
    .split('#')[0]
    .replace(/\$\{([A-Za-z_$][\w$]*)\}/g, '{$1}')
    .replace(/\[\.\.\.([^\]]+)\]/g, '{$1}')
    .replace(/\[([^\]]+)\]/g, '{$1}');
  if (!result.startsWith('/')) result = `/${result}`;
  if (result.startsWith('/api/')) result = result.slice(4);
  result = result.replace(/\/{2,}/g, '/');
  return result.length > 1 ? result.replace(/\/$/, '') : result;
}

function transform(value) {
  if (Array.isArray(value)) return value.map(transform);
  if (value && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (OMITTED_KEYS.has(key)) continue;
      output[key] = transform(value[key]);
    }
    return output;
  }
  if (typeof value === 'string') return sanitizeString(value);
  return value;
}

/** Produce a deterministic, host-free OpenAPI document. */
function normalizeOpenApi(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('OpenAPI document must be a JSON object.');
  }
  const scrubbed = transform(JSON.parse(JSON.stringify(document)));
  const paths = {};
  for (const rawPath of Object.keys(scrubbed.paths || {}).sort()) {
    const normalized = normalizePath(rawPath);
    const item = scrubbed.paths[rawPath];
    if (!paths[normalized]) paths[normalized] = item;
  }
  scrubbed.paths = paths;
  return scrubbed;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizedDigest(document) {
  return crypto.createHash('sha256').update(stableStringify(normalizeOpenApi(document))).digest('hex');
}

function collectOperations(document) {
  const operations = new Map();
  const paths = document?.paths && typeof document.paths === 'object' ? document.paths : {};
  for (const [rawPath, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      if (item[method] && typeof item[method] === 'object') {
        operations.set(`${method.toUpperCase()} ${normalizePath(rawPath)}`, item[method]);
      }
    }
  }
  return operations;
}

function addChange(changes, severity, code, message, context = {}) {
  changes.push({ severity, code, message, ...context });
}

function requiredSet(schema) {
  return new Set(Array.isArray(schema?.required) ? schema.required : []);
}

function compareSchemas(before, after, context, changes, depth = 0) {
  if (!before || typeof before !== 'object') return;
  if (!after || typeof after !== 'object') {
    addChange(changes, 'breaking', 'schema.removed', 'Schema was removed.', context);
    return;
  }
  if (depth > MAX_SCHEMA_DEPTH) return;

  const beforeType = before.type;
  const afterType = after.type;
  if (beforeType && afterType) {
    const widened =
      Array.isArray(afterType) && (Array.isArray(beforeType) ? beforeType : [beforeType]).every((type) => afterType.includes(type));
    if (beforeType !== afterType && !widened) {
      addChange(changes, 'breaking', 'schema.type', `Type changed from ${JSON.stringify(beforeType)} to ${JSON.stringify(afterType)}.`, context);
    }
  } else if (beforeType && !afterType) {
    addChange(changes, 'breaking', 'schema.type', `Type ${JSON.stringify(beforeType)} was removed.`, context);
  } else if (!beforeType && afterType) {
    addChange(changes, 'non-breaking', 'schema.type', `Type ${JSON.stringify(afterType)} was added.`, context);
  }

  if (Array.isArray(before.enum) && Array.isArray(after.enum)) {
    const beforeValues = new Set(before.enum.map((value) => stableStringify(value)));
    const afterValues = new Set(after.enum.map((value) => stableStringify(value)));
    for (const value of beforeValues) {
      if (!afterValues.has(value)) addChange(changes, 'breaking', 'schema.enum', `Enum value ${value} was removed.`, context);
    }
    for (const value of afterValues) {
      if (!beforeValues.has(value)) addChange(changes, 'non-breaking', 'schema.enum', `Enum value ${value} was added.`, context);
    }
  }

  if (before.nullable === true && after.nullable === false) {
    addChange(changes, 'breaking', 'schema.nullable', 'Nullable value became non-nullable.', context);
  }
  if (before.nullable !== true && after.nullable === true) {
    addChange(changes, 'non-breaking', 'schema.nullable', 'Value became nullable.', context);
  }

  if (before.additionalProperties === false && after.additionalProperties !== false) {
    addChange(changes, 'non-breaking', 'schema.additionalProperties', 'Additional properties are now allowed.', context);
  }
  if (before.additionalProperties !== false && after.additionalProperties === false) {
    addChange(changes, 'breaking', 'schema.additionalProperties', 'Additional properties are no longer allowed.', context);
  }

  const beforeRequired = requiredSet(before);
  const afterRequired = requiredSet(after);
  for (const field of beforeRequired) {
    if (!afterRequired.has(field)) {
      addChange(changes, 'non-breaking', 'schema.required', `Property '${field}' is no longer required.`, context);
    }
  }
  for (const field of afterRequired) {
    if (!beforeRequired.has(field)) {
      addChange(changes, 'breaking', 'schema.required', `New required property '${field}'.`, context);
    }
  }

  const beforeProperties = before.properties && typeof before.properties === 'object' ? before.properties : {};
  const afterProperties = after.properties && typeof after.properties === 'object' ? after.properties : {};
  for (const name of Object.keys(beforeProperties)) {
    if (!(name in afterProperties)) {
      addChange(changes, 'breaking', 'schema.property', `Property '${name}' was removed.`, context);
      continue;
    }
    compareSchemas(beforeProperties[name], afterProperties[name], { ...context, field: name }, changes, depth + 1);
  }
  for (const name of Object.keys(afterProperties)) {
    if (!(name in beforeProperties)) {
      addChange(
        changes,
        afterRequired.has(name) ? 'breaking' : 'non-breaking',
        'schema.property',
        `Property '${name}' was added${afterRequired.has(name) ? ' as required' : ''}.`,
        context,
      );
    }
  }

  if (before.items && after.items) {
    compareSchemas(before.items, after.items, { ...context, field: '[]' }, changes, depth + 1);
  }
  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    if (!Array.isArray(before[keyword])) continue;
    const afterList = Array.isArray(after[keyword]) ? after[keyword] : [];
    if (afterList.length < before[keyword].length) {
      addChange(changes, 'breaking', `schema.${keyword}`, `${keyword} alternatives were removed.`, context);
    }
    before[keyword].slice(0, afterList.length).forEach((entry, index) => {
      compareSchemas(entry, afterList[index], { ...context, field: `${keyword}[${index}]` }, changes, depth + 1);
    });
  }

  if (before.$ref && after.$ref && before.$ref !== after.$ref) {
    addChange(changes, 'informational', 'schema.ref', `Reference changed from ${before.$ref} to ${after.$ref}.`, context);
  }
  if (before.format && after.format && before.format !== after.format) {
    addChange(changes, 'informational', 'schema.format', `Format changed from ${before.format} to ${after.format}.`, context);
  }
}

function compareParameters(beforeList, afterList, context, changes) {
  const index = (list) => {
    const map = new Map();
    for (const parameter of Array.isArray(list) ? list : []) {
      if (parameter && typeof parameter === 'object') map.set(`${parameter.in}:${parameter.name}`, parameter);
    }
    return map;
  };
  const before = index(beforeList);
  const after = index(afterList);

  for (const [key, parameter] of before) {
    if (!after.has(key)) {
      addChange(
        changes,
        parameter.required ? 'breaking' : 'non-breaking',
        'parameter.removed',
        `Parameter '${key}' was removed.`,
        context,
      );
      continue;
    }
    const replacement = after.get(key);
    if (parameter.required && !replacement.required) {
      addChange(changes, 'non-breaking', 'parameter.required', `Parameter '${key}' is no longer required.`, context);
    }
    if (!parameter.required && replacement.required) {
      addChange(changes, 'breaking', 'parameter.required', `Parameter '${key}' is now required.`, context);
    }
    compareSchemas(parameter.schema, replacement.schema, { ...context, field: `parameter:${key}` }, changes);
  }
  for (const [key, parameter] of after) {
    if (!before.has(key)) {
      addChange(
        changes,
        parameter.required ? 'breaking' : 'non-breaking',
        'parameter.added',
        `Parameter '${key}' was added${parameter.required ? ' as required' : ''}.`,
        context,
      );
    }
  }
}

function compareContent(beforeContent, afterContent, context, changes) {
  const before = beforeContent && typeof beforeContent === 'object' ? beforeContent : {};
  const after = afterContent && typeof afterContent === 'object' ? afterContent : {};
  for (const mediaType of Object.keys(before)) {
    if (!(mediaType in after)) {
      addChange(changes, 'breaking', 'content.removed', `Media type '${mediaType}' was removed.`, context);
      continue;
    }
    compareSchemas(before[mediaType]?.schema, after[mediaType]?.schema, { ...context, field: mediaType }, changes);
  }
  for (const mediaType of Object.keys(after)) {
    if (!(mediaType in before)) {
      addChange(changes, 'non-breaking', 'content.added', `Media type '${mediaType}' was added.`, context);
    }
  }
}

function compareResponses(beforeResponses, afterResponses, context, changes) {
  const before = beforeResponses && typeof beforeResponses === 'object' ? beforeResponses : {};
  const after = afterResponses && typeof afterResponses === 'object' ? afterResponses : {};
  for (const code of Object.keys(before)) {
    if (!(code in after)) {
      const success = /^2\d\d$/.test(code);
      addChange(
        changes,
        success ? 'breaking' : 'non-breaking',
        'response.removed',
        `Response ${code} was removed.`,
        context,
      );
      continue;
    }
    compareContent(before[code]?.content, after[code]?.content, { ...context, field: `response:${code}` }, changes);
  }
  for (const code of Object.keys(after)) {
    if (!(code in before)) {
      addChange(changes, 'non-breaking', 'response.added', `Response ${code} was added.`, context);
    }
  }
}

function compareOperation(before, after, key, changes) {
  const context = { operation: key };
  if (before.deprecated === true && after.deprecated !== true) {
    addChange(changes, 'non-breaking', 'operation.undeprecated', 'Operation is no longer deprecated.', context);
  }
  if (before.deprecated !== true && after.deprecated === true) {
    addChange(changes, 'informational', 'operation.deprecated', 'Operation was marked deprecated.', context);
  }
  if (before.operationId && after.operationId && before.operationId !== after.operationId) {
    addChange(changes, 'informational', 'operation.id', `Operation ID changed from ${before.operationId} to ${after.operationId}.`, context);
  }
  compareParameters(before.parameters, after.parameters, context, changes);

  const beforeBody = before.requestBody;
  const afterBody = after.requestBody;
  if (beforeBody && !afterBody) {
    addChange(changes, 'breaking', 'requestBody.removed', 'Request body was removed.', context);
  } else if (!beforeBody && afterBody) {
    addChange(
      changes,
      afterBody.required ? 'breaking' : 'non-breaking',
      'requestBody.added',
      `Request body was added${afterBody.required ? ' as required' : ''}.`,
      context,
    );
  } else if (beforeBody && afterBody) {
    if (beforeBody.required && !afterBody.required) {
      addChange(changes, 'non-breaking', 'requestBody.required', 'Request body is no longer required.', context);
    }
    if (!beforeBody.required && afterBody.required) {
      addChange(changes, 'breaking', 'requestBody.required', 'Request body is now required.', context);
    }
    compareContent(beforeBody.content, afterBody.content, { ...context, field: 'requestBody' }, changes);
  }

  compareResponses(before.responses, after.responses, context, changes);
}

/** Compare a committed baseline against a freshly generated normalized spec. */
function compareOpenApi({ baseline, current }) {
  const changes = [];
  const before = collectOperations(baseline);
  const after = collectOperations(current);

  for (const key of before.keys()) {
    if (!after.has(key)) addChange(changes, 'breaking', 'operation.removed', `Operation ${key} was removed.`, { operation: key });
  }
  for (const key of after.keys()) {
    if (!before.has(key)) addChange(changes, 'non-breaking', 'operation.added', `Operation ${key} was added.`, { operation: key });
  }
  for (const [key, operation] of before) {
    if (after.has(key)) compareOperation(operation, after.get(key), key, changes);
  }

  const baselineText = stableStringify(baseline);
  const currentText = stableStringify(current);
  const referencedSchemas = new Set(
    [...baselineText.matchAll(/#\/components\/schemas\/([A-Za-z0-9_.-]+)/g)].map((match) => match[1]),
  );
  const beforeSchemas = baseline?.components?.schemas && typeof baseline.components.schemas === 'object' ? baseline.components.schemas : {};
  const afterSchemas = current?.components?.schemas && typeof current.components.schemas === 'object' ? current.components.schemas : {};
  for (const name of Object.keys(beforeSchemas)) {
    if (!(name in afterSchemas) && referencedSchemas.has(name)) {
      addChange(changes, 'breaking', 'component.removed', `Referenced component schema '${name}' was removed.`, { field: name });
    }
  }
  for (const name of Object.keys(afterSchemas)) {
    if (!(name in beforeSchemas)) {
      addChange(changes, 'non-breaking', 'component.added', `Component schema '${name}' was added.`, { field: name });
    }
  }

  const counts = {
    breaking: changes.filter((change) => change.severity === 'breaking').length,
    'non-breaking': changes.filter((change) => change.severity === 'non-breaking').length,
    informational: changes.filter((change) => change.severity === 'informational').length,
  };
  return { changes, counts };
}

function formatReport({ changes, counts, baselineDigest, currentDigest, seedBaseline = false }) {
  const lines = [
    '## API contract review',
    '',
    `Baseline digest: \`${baselineDigest}\`  `,
    `Current normalized digest: \`${currentDigest}\``,
    '',
    `| Classification | Count |`,
    `| --- | ---: |`,
    `| Breaking | ${counts.breaking} |`,
    `| Non-breaking | ${counts['non-breaking']} |`,
    `| Informational | ${counts.informational} |`,
    '',
  ];
  if (seedBaseline) {
    lines.push('> The committed baseline is a proxy-derived seed. Run `npm run api:contract:update` after review to capture the full normalized contract.', '');
  }
  if (changes.length === 0) {
    lines.push('No API contract changes detected.', '');
  } else {
    for (const severity of ['breaking', 'non-breaking', 'informational']) {
      const group = changes.filter((change) => change.severity === severity);
      if (group.length === 0) continue;
      lines.push(`### ${severity === 'non-breaking' ? 'Non-breaking' : severity[0].toUpperCase() + severity.slice(1)} changes`, '');
      for (const change of group) lines.push(`- ${change.message}`);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}

module.exports = {
  HTTP_METHODS,
  normalizePath,
  sanitizeString,
  normalizeOpenApi,
  stableStringify,
  normalizedDigest,
  collectOperations,
  compareOpenApi,
  formatReport,
};
