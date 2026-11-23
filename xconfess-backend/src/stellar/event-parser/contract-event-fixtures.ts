/**
 * Deterministic fixtures for every public event documented in
 * docs/contract-abi-reference.md § Public Event Schema Fixtures.
 *
 * These are the values an on-chain event would carry, in field order,
 * intended to be shared between contract-side fixture generation and
 * backend parser tests so both sides drift together rather than apart.
 */
import { GOVERNANCE_STREAM_TOPIC } from './contract-event-parser';
import { EventCategory, RawContractEvent } from './contract-event-parser.types';

export interface ContractEventFixture extends RawContractEvent {
  eventName: string;
  category: EventCategory;
  description: string;
}

const ADDR_A = 'GA000000000000000000000000000000000000000000000000000000AAAA';
const ADDR_B = 'GB000000000000000000000000000000000000000000000000000000BBBB';
const CONTENT_HASH = new Array(32).fill(0x42);

export const CONTRACT_EVENT_FIXTURES: ContractEventFixture[] = [
  {
    eventName: 'ConfessionAnchoredEvent', category: 'anchor', topic: 'confession_anchor', eventVersion: 1,
    values: [1, 1_700_000_000_000, 12345],
    description: 'Confession hash anchored at ledger 12345',
  },
  {
    eventName: 'VersionCompatibilityCheckedEvent', category: 'anchor', topic: 'version_compatibility_checked', eventVersion: 1,
    values: [1, 7, 1_700_000_000_001, 1, 0, 0, 1, 1, 0, true],
    description: 'Upgrade compatibility check from 1.0.0 to 1.1.0',
  },
  {
    eventName: 'SettlementEvent', category: 'tip', topic: 'tip_settl', eventVersion: 1,
    values: [ADDR_A, 1, 1, 1_000_000, 'txhash:abc123', true, 1_700_000_000_002],
    description: 'Tip settlement with proof metadata',
  },
  {
    eventName: 'ConfessionEvent', category: 'confession', topic: 'confess', eventVersion: 1,
    values: [1, 42, ADDR_A, CONTENT_HASH, 3, 1_700_000_000_003, 'corr-conf-1'],
    description: 'Confession created',
  },
  {
    eventName: 'ReactionEvent', category: 'reaction', topic: 'react', eventVersion: 1,
    values: [1, 42, ADDR_B, 'heart', 4, 1_700_000_000_004, 'corr-react-1'],
    description: 'Reaction added to a confession',
  },
  {
    eventName: 'PauseChangedEvent', category: 'pause', topic: 'tip_pause', eventVersion: 1,
    values: [ADDR_A, true, 'incident_response', 1_700_000_000_005],
    description: 'Tipping contract paused',
  },
  {
    eventName: 'ReportEvent', category: 'report', topic: 'report', eventVersion: 1,
    values: [1, 42, ADDR_B, 'spam', 1, 1_700_000_000_010, 'corr1234'],
    description: 'Confession reported for spam',
  },
  {
    eventName: 'ReportSubmittedLedgerEvent', category: 'report', topic: 'report', eventVersion: 1,
    values: [42, ADDR_B, 'spam', 1, 2, 1_700_000_000_011],
    description: 'Report ledger-mirror event (same topic as ReportEvent, shorter shape)',
  },
  {
    eventName: 'RoleEvent', category: 'role', topic: 'role', eventVersion: 1,
    values: [1, ADDR_A, 'moderator', true, 5, 1_700_000_000_006, 'corr-role-1'],
    description: 'Moderator role granted',
  },
  {
    eventName: 'GovernanceProposedEvent', category: 'governance', topic: 'gov_prop', eventVersion: 1,
    values: [1, ADDR_A],
    description: 'Governance proposal created',
  },
  {
    eventName: 'GovernanceApprovedEvent', category: 'governance', topic: 'gov_app', eventVersion: 1,
    values: [1, ADDR_B],
    description: 'Governance proposal approved',
  },
  {
    eventName: 'GovernanceApprovalRevokedEvent', category: 'governance', topic: 'gov_rev', eventVersion: 1,
    values: [1, ADDR_B],
    description: 'Governance approval revoked',
  },
  {
    eventName: 'GovernanceExecutedEvent', category: 'governance', topic: 'gov_exec', eventVersion: 1,
    values: [1, ADDR_A],
    description: 'Governance proposal executed',
  },
  {
    eventName: 'GovInvariantViolationEvent', category: 'governance', topic: 'gov_inv', eventVersion: 1,
    values: [6, 1_700_000_000_007, 'gov_execute', 'quorum_not_reached', ADDR_B],
    description: 'Governance invariant violated during execution',
  },
  {
    eventName: 'GovernanceEvent', category: 'governance', topic: GOVERNANCE_STREAM_TOPIC, eventVersion: 1,
    values: [1, 'proposal:1:quorum_updated', 8, 1_700_000_000_008],
    description: 'Governance stream event on a dynamic per-proposal topic',
  },
  {
    eventName: 'BadgeEvent', category: 'reputation', topic: 'badge', eventVersion: 1,
    values: [1, 1, 'ConfessionStarter', ADDR_A, 'Grant', 9, 1_700_000_000_009],
    description: 'Badge awarded (generic badge topic, includes nonce)',
  },
  {
    eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_awarded', eventVersion: 1,
    values: [1, 2, 'PopularVoice', ADDR_B, 'Grant', 1_700_000_000_012],
    description: 'Badge awarded by admin',
  },
  {
    eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_granted', eventVersion: 1,
    values: [1, 3, 'GenerousSoul', ADDR_A, 'Grant', 1_700_000_000_013],
    description: 'Badge self-granted (mint_badge)',
  },
  {
    eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_revoked', eventVersion: 1,
    values: [1, 3, 'GenerousSoul', ADDR_A, 'Revoke', 1_700_000_000_014],
    description: 'Badge revoked',
  },
  {
    eventName: 'ReputationAdjustedData', category: 'reputation', topic: 'reputation_adjusted', eventVersion: 1,
    values: [ADDR_A, 10, 'confession_upvoted', 1_700_000_000_015],
    description: 'Reputation increased',
  },
  {
    eventName: 'ReputationDecayedData', category: 'reputation', topic: 'reputation_decayed', eventVersion: 1,
    values: [ADDR_A, 100, 90, 2, 1_700_000_000_016],
    description: 'Reputation decayed after inactivity epochs',
  },
];
