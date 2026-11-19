export interface FrontendContractEventFixture {
  eventName: string;
  category: string;
  topic: string;
  eventVersion: number;
  fieldOrder: string[];
}

export const FRONTEND_CONTRACT_EVENT_FIXTURES: FrontendContractEventFixture[] = [
  { eventName: 'ConfessionAnchoredEvent', category: 'anchor', topic: 'confession_anchor', eventVersion: 1, fieldOrder: ['event_version','timestamp','anchor_height'] },
  { eventName: 'VersionCompatibilityCheckedEvent', category: 'anchor', topic: 'version_compatibility_checked', eventVersion: 1, fieldOrder: ['event_version','nonce','timestamp','from_major','from_minor','from_patch','to_major','to_minor','to_patch','compatible'] },
  { eventName: 'SettlementEvent', category: 'tip', topic: 'tip_settl', eventVersion: 1, fieldOrder: ['recipient','event_version','settlement_id','amount','proof_metadata','proof_present','timestamp'] },
  { eventName: 'ConfessionEvent', category: 'confession', topic: 'confess', eventVersion: 1, fieldOrder: ['event_version','confession_id','author','content_hash','nonce','timestamp','correlation_id'] },
  { eventName: 'ReactionEvent', category: 'reaction', topic: 'react', eventVersion: 1, fieldOrder: ['event_version','confession_id','reactor','reaction_type','nonce','timestamp','correlation_id'] },
  { eventName: 'PauseChangedEvent', category: 'pause', topic: 'tip_pause', eventVersion: 1, fieldOrder: ['actor','paused','reason','timestamp'] },
  { eventName: 'ReportEvent', category: 'report', topic: 'report', eventVersion: 1, fieldOrder: ['event_version','confession_id','reporter','reason','nonce','timestamp','correlation_id'] },
  { eventName: 'ReportSubmittedLedgerEvent', category: 'report', topic: 'report', eventVersion: 1, fieldOrder: ['confession_id','actor','reason','event_version','nonce','timestamp'] },
  { eventName: 'RoleEvent', category: 'role', topic: 'role', eventVersion: 1, fieldOrder: ['event_version','user','role','granted','nonce','timestamp','correlation_id'] },
  { eventName: 'GovernanceEvent', category: 'governance', topic: '<stream>', eventVersion: 1, fieldOrder: ['event_version','metadata','nonce','timestamp'] },
  { eventName: 'GovernanceProposedEvent', category: 'governance', topic: 'gov_prop', eventVersion: 1, fieldOrder: ['proposal_id','proposer'] },
  { eventName: 'GovernanceApprovedEvent', category: 'governance', topic: 'gov_app', eventVersion: 1, fieldOrder: ['proposal_id','approver'] },
  { eventName: 'GovernanceApprovalRevokedEvent', category: 'governance', topic: 'gov_rev', eventVersion: 1, fieldOrder: ['proposal_id','actor'] },
  { eventName: 'GovernanceExecutedEvent', category: 'governance', topic: 'gov_exec', eventVersion: 1, fieldOrder: ['proposal_id','executor'] },
  { eventName: 'GovInvariantViolationEvent', category: 'governance', topic: 'gov_inv', eventVersion: 1, fieldOrder: ['nonce','timestamp','operation','reason','attempted_by'] },
  { eventName: 'BadgeEvent', category: 'reputation', topic: 'badge', eventVersion: 1, fieldOrder: ['event_version','badge_id','badge_type','owner','action','nonce','timestamp'] },
  { eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_awarded', eventVersion: 1, fieldOrder: ['event_version','badge_id','badge_type','owner','action','timestamp'] },
  { eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_granted', eventVersion: 1, fieldOrder: ['event_version','badge_id','badge_type','owner','action','timestamp'] },
  { eventName: 'BadgeEvent', category: 'reputation', topic: 'badge_revoked', eventVersion: 1, fieldOrder: ['event_version','badge_id','badge_type','owner','action','timestamp'] },
  { eventName: 'ReputationAdjustedData', category: 'reputation', topic: 'reputation_adjusted', eventVersion: 1, fieldOrder: ['user','amount','reason','timestamp'] },
  { eventName: 'ReputationDecayedData', category: 'reputation', topic: 'reputation_decayed', eventVersion: 1, fieldOrder: ['user','old_reputation','new_reputation','epochs_applied','timestamp'] }
];
