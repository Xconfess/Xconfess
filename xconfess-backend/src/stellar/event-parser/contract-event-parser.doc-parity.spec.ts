/**
 * Contract/backend fixture parity test.
 *
 * xconfess-contracts/contracts/events.rs defines PUBLIC_EVENT_SCHEMA_FIXTURES
 * and asserts (in its own #[cfg(test)] block, `public_event_metadata_matches_documented_abi`)
 * that every entry's event name and fields appear in
 * docs/contract-abi-reference.md.
 *
 * This test closes the loop from the backend side: it parses the same
 * "Public Event Schema Fixtures" table out of that doc and asserts our
 * contract-event-parser.ts registry matches it exactly — same topics, same
 * field order, same row count. Since the contract-side registry is already
 * pinned to that doc, a passing test here transitively proves the contract
 * and backend registries agree, without needing a cross-language fixture
 * loader.
 *
 * If this test fails, either:
 *  - the doc was updated and contract-event-parser.ts needs the matching
 *    change, or
 *  - contract-event-parser.ts drifted from the doc and must be corrected.
 * See docs/contract-event-parser-compatibility.md for the upgrade checklist.
 */
import * as fs from 'fs';
import * as path from 'path';
import { GOVERNANCE_STREAM_TOPIC, getCompatibilityMatrix } from './contract-event-parser';

interface DocFixtureRow {
  eventName: string;
  category: string;
  topic: string;
  dataFormat: string;
  fieldOrder: string[];
}

function parsePublicEventSchemaFixturesTable(markdown: string): DocFixtureRow[] {
  const sectionStart = markdown.indexOf('## Public Event Schema Fixtures');
  expect(sectionStart).toBeGreaterThan(-1);
  const sectionEnd = markdown.indexOf('\n## ', sectionStart + 1);
  const section = markdown.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const rowPattern =
    /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/gm;

  const rows: DocFixtureRow[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section)) !== null) {
    const [, eventName, category, topic, dataFormat, fieldOrderCell] = match;
    const fieldOrder = [...fieldOrderCell.matchAll(/`([a-zA-Z0-9_]+)`/g)].map((m) => m[1]);
    rows.push({ eventName, category, topic, dataFormat, fieldOrder });
  }
  return rows;
}

describe('Backend registry ⇄ docs/contract-abi-reference.md parity', () => {
  const docPath = path.join(__dirname, '../../../../docs/contract-abi-reference.md');
  const markdown = fs.readFileSync(docPath, 'utf8');
  const docRows = parsePublicEventSchemaFixturesTable(markdown);
  const registryRows = getCompatibilityMatrix();

  it('parsed at least one row from the doc table (sanity check on the parser itself)', () => {
    expect(docRows.length).toBeGreaterThan(0);
  });

  it('has exactly one registry entry per documented fixture row (same count)', () => {
    expect(registryRows).toHaveLength(docRows.length);
  });

  it.each(docRows.map((row, i) => [i, row.eventName, row.topic, row]))(
    'doc row %s (%s on "%s") matches a registry entry field-for-field',
    (_i, _eventName, _topic, row: DocFixtureRow) => {
      const docTopic = row.topic === '<stream>' ? GOVERNANCE_STREAM_TOPIC : row.topic;

      const registryMatch = registryRows.find(
        (r) => r.eventName === row.eventName && r.topic === docTopic,
      );

      expect(registryMatch).toBeDefined();
      expect(registryMatch!.category).toBe(row.category);
      expect([...registryMatch!.fieldOrder]).toEqual(row.fieldOrder);
    },
  );

  it('has no registry entry that is missing from the docs (no undocumented fixtures)', () => {
    for (const registryRow of registryRows) {
      const docTopic =
        registryRow.topic === GOVERNANCE_STREAM_TOPIC ? '<stream>' : registryRow.topic;
      const docMatch = docRows.find(
        (r) => r.eventName === registryRow.eventName && r.topic === docTopic,
      );
      expect(docMatch).toBeDefined();
    }
  });
});
