/**
 * Types and typed errors for the Stellar contract event compatibility layer.
 *
 * @see docs/contract-abi-reference.md#public-event-schema-fixtures — source of
 *      truth for topic names, categories, and field order used by the
 *      registry in contract-event-parser.ts.
 * @see docs/contract-event-parser-compatibility.md — upgrade checklist.
 */

export type EventCategory =
  | 'anchor'
  | 'tip'
  | 'confession'
  | 'reaction'
  | 'report'
  | 'role'
  | 'governance'
  | 'badge'
  | 'reputation'
  | 'pause';

export interface RawContractEvent {
  /** Event topic string as emitted on-chain (first #[topic] symbol). */
  topic: string;
  /**
   * Schema version carried by the event. For events whose payload predates
   * an `event_version` field, callers pass the documented convention
   * version (1) — see the registry comment in contract-event-parser.ts.
   */
  eventVersion: number;
  /** Field values in on-chain emission order. */
  values: unknown[];
}

export interface ParsedContractEvent<
  TFields extends Record<string, unknown> = Record<string, unknown>,
> {
  eventName: string;
  category: EventCategory;
  topic: string;
  eventVersion: number;
  fields: TFields;
}

export enum EventParseErrorCode {
  UNKNOWN_TOPIC = 'UNKNOWN_TOPIC',
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION',
  MALFORMED_PAYLOAD = 'MALFORMED_PAYLOAD',
}

export interface EventParseErrorContext {
  topic: string;
  eventVersion?: number;
  knownVersions?: number[];
  expectedFieldCounts?: number[];
  receivedFieldCount?: number;
}

/**
 * Typed, fail-closed error for any event the parser cannot safely decode.
 *
 * `retryable` tells an indexer whether re-processing the same payload later
 * could succeed without a code change:
 *  - UNKNOWN_TOPIC / MALFORMED_PAYLOAD are never retryable — the topic needs
 *    a registry entry or the payload is simply invalid.
 *  - UNSUPPORTED_VERSION is retryable only when the observed version is
 *    *newer* than anything the registry knows about (the contract was
 *    upgraded ahead of the backend; reprocessing after deploying a parser
 *    that registers the new version can succeed). A version below the known
 *    range is terminal: it was deprecated, not merely not-yet-supported.
 */
export class ContractEventParseError extends Error {
  constructor(
    public readonly code: EventParseErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly context: EventParseErrorContext,
  ) {
    super(message);
    this.name = 'ContractEventParseError';
  }
}
