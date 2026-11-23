import {
  ContractEventParseError,
  EventCategory,
  EventParseErrorCode,
  ParsedContractEvent,
  RawContractEvent,
} from './contract-event-parser.types';

/**
 * `GovernanceEvent` is emitted on a per-proposal stream topic (documented in
 * the ABI reference as `<stream>`), so it has no fixed on-chain topic
 * string. Route it through parseGovernanceStreamEvent() instead of a literal
 * topic lookup.
 */
export const GOVERNANCE_STREAM_TOPIC = '__governance_stream__';

interface EventSchema {
  eventName: string;
  category: EventCategory;
  topic: string;
  eventVersion: number;
  fieldOrder: readonly string[];
}

/**
 * Versioned event registry — the compatibility layer's single source of truth.
 *
 * How to add a new event version safely:
 * 1. Update docs/contract-abi-reference.md "Public Event Schema Fixtures"
 *    table first — this registry must match it field-for-field.
 * 2. Append a NEW EventSchema entry with the bumped `eventVersion`. Never
 *    mutate or remove an existing entry: historical on-chain events must
 *    keep parsing under their original schema.
 * 3. Add a matching fixture to contract-event-fixtures.ts.
 * 4. Run `npm test -- contract-event-parser` in xconfess-backend — the
 *    fixture-parity test fails if the fixtures and this registry diverge.
 *
 * See docs/contract-event-parser-compatibility.md for the full checklist and
 * the retry-classification rules for unsupported versions.
 */
const EVENT_SCHEMAS: readonly EventSchema[] = [
  {
    eventName: 'ConfessionAnchoredEvent', category: 'anchor', topic: 'confession_anchor', eventVersion: 1,
    fieldOrder: ['event_version', 'timestamp', 'anchor_height'],
  },
  {
    eventName: 'VersionCompatibilityCheckedEvent', category: 'anchor', topic: 'version_compatibility_checked', eventVersion: 1,
    fieldOrder: ['event_version', 'nonce', 'timestamp', 'from_major', 'from_minor', 'from_patch', 'to_major', 'to_minor', 'to_patch', 'compatible'],
  },
  {
    eventName: 'SettlementEvent', category: 'tip', topic: 'tip_settl', eventVersion: 1,
    fieldOrder: ['recipient', 'event_version', 'settlement_id', 'amount', 'proof_metadata', 'proof_present', 'timestamp'],
  },
  {
    eventName: 'ConfessionEvent', category: 'confession', topic: 'confess', eventVersion: 1,
    fieldOrder: ['event_version', 'confession_id', 'author', 'content_hash', 'nonce', 'timestamp', 'correlation_id'],
  },
  {
    eventName: 'ReactionEvent', category: 'reaction', topic: 'react', eventVersion: 1,
    fieldOrder: ['event_version', 'confession_id', 'reactor', 'reaction_type', 'nonce', 'timestamp', 'correlation_id'],
  },
  {
    eventName: 'PauseChangedEvent', category: 'pause', topic: 'tip_pause', eventVersion: 1,
    fieldOrder: ['actor', 'paused', 'reason', 'timestamp'],
  },
  {
    eventName: 'ReportEvent', category: 'report', topic: 'report', eventVersion: 1,
    fieldOrder: ['event_version', 'confession_id', 'reporter', 'reason', 'nonce', 'timestamp', 'correlation_id'],
  },
  {
    // Same topic as ReportEvent but a distinct shape (6 fields, no
    // correlation_id) — disambiguated at parse time by field count.
    eventName: 'ReportSubmittedLedgerEvent', category: 'report', topic: 'report', eventVersion: 1,
    fieldOrder: ['confession_id', 'actor', 'reason', 'event_version', 'nonce', 'timestamp'],
  },
  {
    eventName: 'RoleEvent', category: 'role', topic: 'role', eventVersion: 1,
    fieldOrder: ['event_version', 'user', 'role', 'granted', 'nonce', 'timestamp', 'correlation_id'],
  },
  {
    eventName: 'GovernanceProposedEvent', category: 'governance', topic: 'gov_prop', eventVersion: 1,
    fieldOrder: ['proposal_id', 'proposer'],
  },
  {
    eventName: 'GovernanceApprovedEvent', category: 'governance', topic: 'gov_app', eventVersion: 1,
    fieldOrder: ['proposal_id', 'approver'],
  },
  {
    eventName: 'GovernanceApprovalRevokedEvent', category: 'governance', topic: 'gov_rev', eventVersion: 1,
    fieldOrder: ['proposal_id', 'actor'],
  },
  {
    eventName: 'GovernanceExecutedEvent', category: 'governance', topic: 'gov_exec', eventVersion: 1,
    fieldOrder: ['proposal_id', 'executor'],
  },
  {
    eventName: 'GovInvariantViolationEvent', category: 'governance', topic: 'gov_inv', eventVersion: 1,
    fieldOrder: ['nonce', 'timestamp', 'operation', 'reason', 'attempted_by'],
  },
  {
    eventName: 'GovernanceEvent', category: 'governance', topic: GOVERNANCE_STREAM_TOPIC, eventVersion: 1,
    fieldOrder: ['event_version', 'metadata', 'nonce', 'timestamp'],
  },
  {
    eventName: 'BadgeEvent', category: 'reputation', topic: 'badge', eventVersion: 1,
    fieldOrder: ['event_version', 'badge_id', 'badge_type', 'owner', 'action', 'nonce', 'timestamp'],
  },
  {
    eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_awarded', eventVersion: 1,
    fieldOrder: ['event_version', 'badge_id', 'badge_type', 'owner', 'action', 'timestamp'],
  },
  {
    eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_granted', eventVersion: 1,
    fieldOrder: ['event_version', 'badge_id', 'badge_type', 'owner', 'action', 'timestamp'],
  },
  {
    eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_revoked', eventVersion: 1,
    fieldOrder: ['event_version', 'badge_id', 'badge_type', 'owner', 'action', 'timestamp'],
  },
  {
    eventName: 'ReputationAdjustedData', category: 'reputation', topic: 'reputation_adjusted', eventVersion: 1,
    fieldOrder: ['user', 'amount', 'reason', 'timestamp'],
  },
  {
    eventName: 'ReputationDecayedData', category: 'reputation', topic: 'reputation_decayed', eventVersion: 1,
    fieldOrder: ['user', 'old_reputation', 'new_reputation', 'epochs_applied', 'timestamp'],
  },
];

const SCHEMAS_BY_TOPIC = new Map<string, EventSchema[]>();
for (const schema of EVENT_SCHEMAS) {
  const list = SCHEMAS_BY_TOPIC.get(schema.topic) ?? [];
  list.push(schema);
  SCHEMAS_BY_TOPIC.set(schema.topic, list);
}

/**
 * Parse a raw Stellar contract event into a typed, versioned shape.
 *
 * Fails closed: any topic, version, or payload shape that isn't explicitly
 * registered throws a ContractEventParseError rather than guessing.
 */
export function parseContractEvent(raw: RawContractEvent): ParsedContractEvent {
  const candidates = SCHEMAS_BY_TOPIC.get(raw.topic);
  if (!candidates || candidates.length === 0) {
    throw new ContractEventParseError(
      EventParseErrorCode.UNKNOWN_TOPIC,
      `No registered event schema for topic "${raw.topic}"`,
      false,
      { topic: raw.topic },
    );
  }

  const versionMatches = candidates.filter((s) => s.eventVersion === raw.eventVersion);
  if (versionMatches.length === 0) {
    const knownVersions = [...new Set(candidates.map((s) => s.eventVersion))].sort(
      (a, b) => a - b,
    );
    const maxKnown = Math.max(...knownVersions);
    throw new ContractEventParseError(
      EventParseErrorCode.UNSUPPORTED_VERSION,
      `Topic "${raw.topic}" event_version ${raw.eventVersion} is not registered (known: ${knownVersions.join(', ')})`,
      raw.eventVersion > maxKnown,
      { topic: raw.topic, eventVersion: raw.eventVersion, knownVersions },
    );
  }

  const fieldMatch = versionMatches.find((s) => s.fieldOrder.length === raw.values.length);
  if (!fieldMatch) {
    throw new ContractEventParseError(
      EventParseErrorCode.MALFORMED_PAYLOAD,
      `Topic "${raw.topic}" v${raw.eventVersion} received ${raw.values.length} fields, expected one of [${versionMatches
        .map((s) => s.fieldOrder.length)
        .join(', ')}]`,
      false,
      {
        topic: raw.topic,
        eventVersion: raw.eventVersion,
        expectedFieldCounts: versionMatches.map((s) => s.fieldOrder.length),
        receivedFieldCount: raw.values.length,
      },
    );
  }

  const fields: Record<string, unknown> = {};
  fieldMatch.fieldOrder.forEach((name, i) => {
    fields[name] = raw.values[i];
  });

  return {
    eventName: fieldMatch.eventName,
    category: fieldMatch.category,
    topic: fieldMatch.topic,
    eventVersion: fieldMatch.eventVersion,
    fields,
  };
}

/** Parse a GovernanceEvent emitted on a dynamic per-proposal stream topic. */
export function parseGovernanceStreamEvent(
  eventVersion: number,
  values: unknown[],
): ParsedContractEvent {
  return parseContractEvent({ topic: GOVERNANCE_STREAM_TOPIC, eventVersion, values });
}

export interface CompatibilityMatrixRow {
  eventName: string;
  category: EventCategory;
  topic: string;
  eventVersion: number;
  fieldOrder: readonly string[];
}

/** Snapshot of every registered (topic, version) schema — used in docs/tests. */
export function getCompatibilityMatrix(): CompatibilityMatrixRow[] {
  return EVENT_SCHEMAS.map((s) => ({ ...s }));
}
