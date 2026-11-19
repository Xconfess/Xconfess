#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rustPath = path.join(root, 'xconfess-contracts/contracts/events.rs');
const backendPath = path.join(root, 'xconfess-backend/src/stellar/event-parser/contract-event-fixtures.ts');
const frontendPath = path.join(root, 'xconfess-frontend/tests/mocks/contract-event-fixtures.ts');
const rustErrorPath = path.join(root, 'xconfess-contracts/contracts/tests/backend_verification_fixtures.rs');
const backendErrorPath = path.join(root, 'xconfess-backend/src/stellar/utils/stellar-contract-errors.ts');
const frontendErrorPath = path.join(root, 'xconfess-frontend/tests/mocks/contract-error-fixtures.ts');

function parseRustEvents(text) {
  const out = [];
  for (const block of text.split('EventSchemaFixture {').slice(1)) {
    const end = block.indexOf('},');
    if (end < 0) continue;
    const body = block.slice(0, end);
    const get = (key) => body.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1];
    const eventName = get('event_name');
    const category = get('category');
    const topic = get('topic');
    const dataFormat = get('data_format');
    const eventVersion = Number(body.match(/event_version:\s*(?:EVENT_VERSION_V1|([0-9]+))/)?.[1] || 1);
    const fieldMatch = body.match(/field_order:\s*&\[([\s\S]*?)\]/);
    const fieldOrder = fieldMatch ? [...fieldMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
    if (eventName) out.push({ eventName, category, topic, dataFormat, eventVersion, fieldOrder });
  }
  return out;
}

function parseBackendEvents(text) {
  const out = [];
  for (const block of text.split(/eventName:/).slice(1)) {
    const body = block.slice(0, block.indexOf('},') >= 0 ? block.indexOf('},') : block.length);
    const eventName = body.match(/^\s*'([^']+)'/)?.[1] || body.match(/^\s*"([^"]+)"/)?.[1];
    const category = body.match(/category:\s*'([^']+)'/)?.[1];
    let topic = body.match(/topic:\s*'([^']+)'/)?.[1];
    if (!topic) topic = body.match(/topic:\s*([A-Z_]+)/)?.[1];
    if (topic === 'GOVERNANCE_STREAM_TOPIC') topic = '<stream>';
    if (!topic) continue;
    const eventVersion = Number(body.match(/eventVersion:\s*(\d+)/)?.[1] || 1);
    const values = body.match(/values:\s*\[([^\]]*)\]/)?.[1];
    const fieldCount = values ? values.split(',').filter((v) => v.trim()).length : 0;
    out.push({ eventName, category, topic, eventVersion, fieldCount });
  }
  return out;
}

function parseFrontendEvents(text) {
  const out = [];
  for (const block of text.split("eventName:").slice(1)) {
    const body = block.slice(0, block.indexOf(' },') >= 0 ? block.indexOf(' },') : block.length);
    const eventName = body.match(/^\s*'([^']+)'/)?.[1];
    if (!eventName) continue;
    const category = body.match(/category:\s*'([^']+)'/)?.[1];
    const topic = body.match(/topic:\s*'([^']+)'/)?.[1];
    const eventVersion = Number(body.match(/eventVersion:\s*(\d+)/)?.[1] || 1);
    const fieldMatch = body.match(/fieldOrder:\s*\[([^\]]*)\]/);
    const fieldOrder = fieldMatch ? [...fieldMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    out.push({ eventName, category, topic, eventVersion, fieldOrder });
  }
  return out;
}

function key(f) { return `${f.eventName}|${f.topic}`; }
function fail(contract, consumer, detail) {
  failures.push({ contract, consumer, detail });
}

const rustEvents = parseRustEvents(fs.readFileSync(rustPath, 'utf8'));
const backendEvents = parseBackendEvents(fs.readFileSync(backendPath, 'utf8'));
const frontendEvents = parseFrontendEvents(fs.readFileSync(frontendPath, 'utf8'));
const failures = [];

for (const contract of rustEvents) {
  const k = key(contract);
  for (const [consumerName, consumers] of [['backend', backendEvents], ['frontend', frontendEvents]]) {
    const consumer = consumers.find((f) => key(f) === k);
    if (!consumer) {
      fail(k, consumerName, 'missing fixture or renamed event/topic');
      continue;
    }
    if (consumer.category !== contract.category) fail(k, consumerName, `category mismatch: contract=${contract.category}, consumer=${consumer.category}`);
    if (consumer.eventVersion !== contract.eventVersion) fail(k, consumerName, `event version mismatch: contract=${contract.eventVersion}, consumer=${consumer.eventVersion}`);
    if (consumer.fieldCount !== undefined && consumer.fieldCount !== contract.fieldOrder.length) fail(k, consumerName, `backend field count incompatible: contract=${contract.fieldOrder.length}, backend=${consumer.fieldCount}`);
    if (consumer.fieldOrder && consumer.fieldOrder.length !== contract.fieldOrder.length) fail(k, consumerName, `frontend field count incompatible: contract=${contract.fieldOrder.length}, frontend=${consumer.fieldOrder.length}`);
    if (consumer.fieldOrder) {
      for (let i = 0; i < contract.fieldOrder.length; i++) {
        if (consumer.fieldOrder[i] !== contract.fieldOrder[i]) fail(k, consumerName, `field ${i + 1} mismatch: contract=${contract.fieldOrder[i]}, frontend=${consumer.fieldOrder[i]}`);
      }
    }
  }
}

for (const [consumerName, consumers] of [['backend', backendEvents], ['frontend', frontendEvents]]) {
  for (const consumer of consumers) {
    if (!rustEvents.some((contract) => key(contract) === key(consumer))) fail(key(consumer), consumerName, 'fixture missing from Soroban contract registry');
  }
}

// Cross-check representative numeric contract error fixtures with backend and frontend consumers.
const rustErrorText = fs.readFileSync(rustErrorPath, 'utf8');
const rustErrors = new Map([...rustErrorText.matchAll(/ErrorCodeFixture\s*\{([\s\S]*?)\}/g)].map((m) => {
  const code = Number(m[1].match(/error_code:\s*(\d+)/)?.[1]);
  const name = m[1].match(/error_name:\s*"([^"]+)"/)?.[1];
  return [code, name];
}).filter(([code]) => code));

function parseErrorRegistry(text, objectName) {
  const out = new Map();
  const start = text.indexOf(objectName);
  if (start < 0) return out;
  const blockEndTs = text.indexOf('\n} as const;', start);
  const blockEndSimple = text.indexOf('\n};', start);
  const candidates = [blockEndTs, blockEndSimple].filter((v) => v >= 0);
  const end = candidates.length ? Math.min(...candidates) : text.length;
  const block = text.slice(start, end);
  for (const m of block.matchAll(/^\s*([A-Z0-9_]+):\s*(\d+)[,]?/gm)) out.set(m[2], m[1]);
  return out;
}
const backendErrorText = fs.readFileSync(backendErrorPath, 'utf8');
const frontendErrorText = fs.readFileSync(frontendErrorPath, 'utf8');
const backendCodes = parseErrorRegistry(backendErrorText, 'export const ANCHOR_ERROR_CODES');
for (const [code, name] of parseErrorRegistry(backendErrorText, 'export const TIPPING_ERROR_CODES')) backendCodes.set(code, name);
for (const [code, name] of parseErrorRegistry(backendErrorText, 'export const REPUTATION_ERROR_CODES')) backendCodes.set(code, name);
const frontendCodes = parseErrorRegistry(frontendErrorText, 'FRONTEND_CONTRACT_ERROR_CODES');

for (const [code, name] of rustErrors) {
  for (const [consumerName, codes] of [['backend', backendCodes], ['frontend', frontendCodes]]) {
    if (!codes.has(String(code))) fail(`error:${code}:${name}`, consumerName, 'numeric contract error code missing');
  }
}

const inventory = { contract: rustEvents, consumers: { backend: backendEvents, frontend: frontendEvents }, errors: { contract: Object.fromEntries(rustErrors), backend: Object.fromEntries(backendCodes), frontend: Object.fromEntries(frontendCodes) } };
if (process.argv.includes('--write')) {
  const out = path.join(root, 'deployments/contract-event-error-inventory.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(inventory, null, 2) + '\n');
  console.log(`Wrote ${path.relative(root, out)}`);
}

if (failures.length) {
  console.error(`Contract/consumer parity failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const item of failures) console.error(`- contract=${item.contract} consumer=${item.consumer}: ${item.detail}`);
  process.exit(1);
}
console.log(`Contract parity OK: ${rustEvents.length} events and ${rustErrors.size} fixture error codes across Soroban, backend, and frontend.`);
