use soroban_sdk::{contracttype, symbol_short, Address, Env, String as SorobanString, Symbol};

/// ===========================================
/// GLOBAL EVENT VERSIONING
/// ===========================================
/// When changing event schemas or `event_version`, follow:
/// `docs/contract-event-version-bump-checklist.md`
pub const EVENT_VERSION_V1: u32 = 1;
pub const EVENT_FIXTURE_VERSION_V1: u32 = 1;

/// Stable discriminators (NEVER CHANGE)
pub const CONFESSION_EVENT: Symbol = symbol_short!("confess");
pub const REACTION_EVENT: Symbol = symbol_short!("react");
pub const REPORT_EVENT: Symbol = symbol_short!("report");
pub const ROLE_EVENT: Symbol = symbol_short!("role");
pub const BADGE_EVENT: Symbol = symbol_short!("badge");

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EventSchemaFixture {
    pub fixture_version: u32,
    pub event_name: &'static str,
    pub category: &'static str,
    pub topic: &'static str,
    pub data_format: &'static str,
    pub event_version: u32,
    pub field_order: &'static [&'static str],
}

pub const PUBLIC_EVENT_SCHEMA_FIXTURES: &[EventSchemaFixture] = &[
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "ConfessionAnchoredEvent",
        category: "anchor",
        topic: "confession_anchor",
        data_format: "vec",
        event_version: EVENT_VERSION_V1,
        field_order: &["event_version", "timestamp", "anchor_height"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "VersionCompatibilityCheckedEvent",
        category: "anchor",
        topic: "version_compatibility_checked",
        data_format: "vec",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "nonce",
            "timestamp",
            "from_major",
            "from_minor",
            "from_patch",
            "to_major",
            "to_minor",
            "to_patch",
            "compatible",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "SettlementEvent",
        category: "tip",
        topic: "tip_settl",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "recipient",
            "event_version",
            "settlement_id",
            "amount",
            "proof_metadata",
            "proof_present",
            "timestamp",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "ConfessionEvent",
        category: "confession",
        topic: "confess",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "confession_id",
            "author",
            "content_hash",
            "nonce",
            "timestamp",
            "correlation_id",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "ReactionEvent",
        category: "reaction",
        topic: "react",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "confession_id",
            "reactor",
            "reaction_type",
            "nonce",
            "timestamp",
            "correlation_id",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "PauseChangedEvent",
        category: "pause",
        topic: "tip_pause",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &["actor", "paused", "reason", "timestamp"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "ReportEvent",
        category: "report",
        topic: "report",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "confession_id",
            "reporter",
            "reason",
            "nonce",
            "timestamp",
            "correlation_id",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "ReportSubmittedLedgerEvent",
        category: "report",
        topic: "report",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "confession_id",
            "actor",
            "reason",
            "event_version",
            "nonce",
            "timestamp",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "RoleEvent",
        category: "role",
        topic: "role",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "user",
            "role",
            "granted",
            "nonce",
            "timestamp",
            "correlation_id",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "GovernanceEvent",
        category: "governance",
        topic: "<stream>",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &["event_version", "metadata", "nonce", "timestamp"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "GovernanceProposedEvent",
        category: "governance",
        topic: "gov_prop",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &["proposal_id", "proposer"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "GovernanceApprovedEvent",
        category: "governance",
        topic: "gov_app",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &["proposal_id", "approver"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "GovernanceApprovalRevokedEvent",
        category: "governance",
        topic: "gov_rev",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &["proposal_id", "actor"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "GovernanceExecutedEvent",
        category: "governance",
        topic: "gov_exec",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &["proposal_id", "executor"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "GovInvariantViolationEvent",
        category: "governance",
        topic: "gov_inv",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &["nonce", "timestamp", "operation", "reason", "attempted_by"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "BadgeEvent",
        category: "reputation",
        topic: "badge",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "badge_id",
            "badge_type",
            "owner",
            "action",
            "nonce",
            "timestamp",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "BadgeEvent",
        category: "reputation",
        topic: "badge_awarded",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "badge_id",
            "badge_type",
            "owner",
            "action",
            "timestamp",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "BadgeEvent",
        category: "reputation",
        topic: "badge_granted",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "badge_id",
            "badge_type",
            "owner",
            "action",
            "timestamp",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "BadgeEvent",
        category: "reputation",
        topic: "badge_revoked",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "event_version",
            "badge_id",
            "badge_type",
            "owner",
            "action",
            "timestamp",
        ],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "ReputationAdjustedData",
        category: "reputation",
        topic: "reputation_adjusted",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &["user", "amount", "reason", "timestamp"],
    },
    EventSchemaFixture {
        fixture_version: EVENT_FIXTURE_VERSION_V1,
        event_name: "ReputationDecayedData",
        category: "reputation",
        topic: "reputation_decayed",
        data_format: "single-value",
        event_version: EVENT_VERSION_V1,
        field_order: &[
            "user",
            "old_reputation",
            "new_reputation",
            "epochs_applied",
            "timestamp",
        ],
    },
];

pub fn decode_event_fixture_schema(
    fixture: &EventSchemaFixture,
) -> Result<EventSchemaFixture, EventDecodeError> {
    if fixture.event_version != EVENT_VERSION_V1 {
        return Err(EventDecodeError::UnsupportedEventVersion(
            fixture.event_version,
        ));
    }

    Ok(*fixture)
}

/// ===========================================
/// GOVERNANCE METADATA LIMITS
/// ===========================================
pub const MAX_REASON_LENGTH: u32 = 64;
pub const MAX_OPERATION_LENGTH: u32 = 32;

/// ===========================================
/// CUSTOM ERRORS
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GovernanceError {
    ReasonTooLong,
    OperationTooLong,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EventDecodeError {
    UnsupportedEventVersion(u32),
    // Add other potential decoding errors if necessary, e.g., MalformedData
}

/// ===========================================
/// VERSIONED EVENT DECODING TRAIT
/// ===========================================
// This trait provides a pattern for safely decoding events based on their version.
// Implement this for each event type that needs versioning.
pub trait VersionedEvent: Sized {
    const CURRENT_VERSION: u32;

    // This method will handle the actual decoding logic.
    // It takes the raw bytes (or whatever format the event is stored in)
    // and the event_version specified in the event data.
    // For simplicity, we'll assume the `event_version` is part of the encoded data.
    // In a real scenario, `raw_data` would likely be `soroban_sdk::Bytes` or similar
    // which needs to be deserialized based on the version.
    fn try_decode_versioned(
        event_version: u32,
        raw_data: soroban_sdk::Bytes,
    ) -> Result<Self, EventDecodeError>;
}

/// ===========================================
/// GOVERNANCE METADATA
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceMetadata {
    pub reason: SorobanString,
    pub operation: SorobanString,
}

/// ===========================================
/// VALIDATION (NO PANICS)
/// ===========================================
fn validate_metadata(_env: &Env, meta: &GovernanceMetadata) -> Result<(), GovernanceError> {
    if meta.reason.len() > MAX_REASON_LENGTH {
        // SorobanString::len() returns u32 in both targets
        return Err(GovernanceError::ReasonTooLong);
    }

    if meta.operation.len() > MAX_OPERATION_LENGTH {
        return Err(GovernanceError::OperationTooLong);
    }

    Ok(())
}

/// ===========================================
/// EVENT NONCE STORAGE
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum EventNonceKey {
    Confession(u64),
    Reaction(u64),
    Report(u64),
    Role(Address, Symbol),
    Governance(Symbol),
    Badge(u64),
}

fn read_nonce(env: &Env, key: &EventNonceKey) -> u64 {
    env.storage().instance().get(key).unwrap_or(0u64)
}

fn bump_nonce(env: &Env, key: EventNonceKey) -> u64 {
    let next = read_nonce(env, &key)
        .checked_add(1)
        .expect("event nonce overflow");
    env.storage().instance().set(&key, &next);
    next
}

pub fn latest_confession_nonce(env: &Env, confession_id: u64) -> u64 {
    read_nonce(env, &EventNonceKey::Confession(confession_id))
}

pub fn latest_reaction_nonce(env: &Env, confession_id: u64) -> u64 {
    read_nonce(env, &EventNonceKey::Reaction(confession_id))
}

pub fn latest_report_nonce(env: &Env, confession_id: u64) -> u64 {
    read_nonce(env, &EventNonceKey::Report(confession_id))
}

pub fn latest_role_nonce(env: &Env, user: Address, role: Symbol) -> u64 {
    read_nonce(env, &EventNonceKey::Role(user, role))
}

pub fn latest_badge_nonce(env: &Env, badge_id: u64) -> u64 {
    read_nonce(env, &EventNonceKey::Badge(badge_id))
}

pub fn latest_governance_nonce(env: &Env, stream: Symbol) -> u64 {
    read_nonce(env, &EventNonceKey::Governance(stream))
}

pub fn next_governance_nonce(env: &Env, stream: Symbol) -> u64 {
    bump_nonce(env, EventNonceKey::Governance(stream))
}

/// ===========================================
/// GOVERNANCE EVENT
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceEvent {
    pub event_version: u32,
    pub metadata: GovernanceMetadata,
    pub nonce: u64,
    pub timestamp: u64,
}

pub fn emit_governance_event(
    env: &Env,
    stream: Symbol,
    metadata: GovernanceMetadata,
) -> Result<(), GovernanceError> {
    validate_metadata(env, &metadata)?;

    let nonce = bump_nonce(env, EventNonceKey::Governance(stream.clone()));

    let payload = GovernanceEvent {
        event_version: EVENT_VERSION_V1,
        metadata,
        nonce,
        timestamp: env.ledger().timestamp(),
    };

    env.events().publish((stream,), payload);

    Ok(())
}

/// ===========================================
/// CONFESSION EVENT
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfessionEvent {
    pub event_version: u32,
    pub confession_id: u64,
    pub author: Address,
    pub content_hash: Symbol,
    pub nonce: u64,
    pub timestamp: u64,
    pub correlation_id: Option<Symbol>,
}

pub fn emit_confession(
    env: &Env,
    confession_id: u64,
    author: Address,
    content_hash: Symbol,
    correlation_id: Option<Symbol>,
) {
    let nonce = bump_nonce(env, EventNonceKey::Confession(confession_id));

    let payload = ConfessionEvent {
        event_version: EVENT_VERSION_V1,
        confession_id,
        author,
        content_hash,
        nonce,
        timestamp: env.ledger().timestamp(),
        correlation_id,
    };

    env.events().publish((CONFESSION_EVENT,), payload);
}

/// ===========================================
/// REACTION EVENT
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReactionEvent {
    pub event_version: u32,
    pub confession_id: u64,
    pub reactor: Address,
    pub reaction_type: Symbol,
    pub nonce: u64,
    pub timestamp: u64,
    pub correlation_id: Option<Symbol>,
}

pub fn emit_reaction(
    env: &Env,
    confession_id: u64,
    reactor: Address,
    reaction_type: Symbol,
    correlation_id: Option<Symbol>,
) {
    let nonce = bump_nonce(env, EventNonceKey::Reaction(confession_id));

    let payload = ReactionEvent {
        event_version: EVENT_VERSION_V1,
        confession_id,
        reactor,
        reaction_type,
        nonce,
        timestamp: env.ledger().timestamp(),
        correlation_id,
    };

    env.events().publish((REACTION_EVENT,), payload);
}

/// ===========================================
/// REPORT EVENT
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReportEvent {
    pub event_version: u32,
    pub confession_id: u64,
    pub reporter: Address,
    pub reason: Symbol,
    pub nonce: u64,
    pub timestamp: u64,
    pub correlation_id: Option<Symbol>,
}

pub fn emit_report(
    env: &Env,
    confession_id: u64,
    reporter: Address,
    reason: Symbol,
    correlation_id: Option<Symbol>,
) {
    let nonce = bump_nonce(env, EventNonceKey::Report(confession_id));

    let payload = ReportEvent {
        event_version: EVENT_VERSION_V1,
        confession_id,
        reporter,
        reason,
        nonce,
        timestamp: env.ledger().timestamp(),
        correlation_id,
    };

    env.events().publish((REPORT_EVENT,), payload);
}

/// ===========================================
/// ROLE EVENT
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleEvent {
    pub event_version: u32,
    pub user: Address,
    pub role: Symbol,
    pub granted: bool,
    pub nonce: u64,
    pub timestamp: u64,
    pub correlation_id: Option<Symbol>,
}

pub fn emit_role(
    env: &Env,
    user: Address,
    role: Symbol,
    granted: bool,
    correlation_id: Option<Symbol>,
) {
    let nonce = bump_nonce(env, EventNonceKey::Role(user.clone(), role.clone()));

    let payload = RoleEvent {
        event_version: EVENT_VERSION_V1,
        user,
        role,
        granted,
        nonce,
        timestamp: env.ledger().timestamp(),
        correlation_id,
    };

    env.events().publish((ROLE_EVENT,), payload);
}

/// ===========================================
/// BADGE EVENT
/// ===========================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BadgeAction {
    Grant,
    Revoke,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BadgeEvent {
    pub event_version: u32,
    pub badge_id: u64,
    pub badge_type: u32,
    pub owner: Address,
    pub action: BadgeAction,
    pub nonce: u64,
    pub timestamp: u64,
}

pub fn emit_badge_event(
    env: &Env,
    badge_id: u64,
    badge_type: u32,
    owner: Address,
    action: BadgeAction,
) {
    let nonce = bump_nonce(env, EventNonceKey::Badge(badge_id));

    let payload = BadgeEvent {
        event_version: EVENT_VERSION_V1,
        badge_id,
        badge_type,
        owner,
        action,
        nonce,
        timestamp: env.ledger().timestamp(),
    };

    env.events().publish((BADGE_EVENT,), payload);
}

/// ===========================================
/// TESTS ( BOUNDARY TESTS )
/// ===========================================
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    fn make_string(env: &Env, len: u32) -> SorobanString {
        let s = "a".repeat(len as usize);
        SorobanString::from_str(env, &s)
    }

    #[test]
    fn reason_max_ok() {
        let env = Env::default();

        let meta = GovernanceMetadata {
            reason: make_string(&env, MAX_REASON_LENGTH),
            operation: make_string(&env, 10),
        };

        assert_eq!(validate_metadata(&env, &meta), Ok(()));
    }

    #[test]
    fn reason_over_limit_fails() {
        let env = Env::default();

        let meta = GovernanceMetadata {
            reason: make_string(&env, MAX_REASON_LENGTH + 1),
            operation: make_string(&env, 10),
        };

        assert_eq!(
            validate_metadata(&env, &meta),
            Err(GovernanceError::ReasonTooLong)
        );
    }

    #[test]
    fn operation_max_ok() {
        let env = Env::default();

        let meta = GovernanceMetadata {
            reason: make_string(&env, 10),
            operation: make_string(&env, MAX_OPERATION_LENGTH),
        };

        assert_eq!(validate_metadata(&env, &meta), Ok(()));
    }

    #[test]
    fn operation_over_limit_fails() {
        let env = Env::default();

        let meta = GovernanceMetadata {
            reason: make_string(&env, 10),
            operation: make_string(&env, MAX_OPERATION_LENGTH + 1),
        };

        assert_eq!(
            validate_metadata(&env, &meta),
            Err(GovernanceError::OperationTooLong)
        );
    }

    // --- Compatibility and constants ---

    #[test]
    fn event_version_constant_is_stable() {
        assert_eq!(EVENT_VERSION_V1, 1);
    }

    #[test]
    fn metadata_boundary_values_are_consistent() {
        let env = Env::default();

        let max_reason = make_string(&env, MAX_REASON_LENGTH);
        let max_operation = make_string(&env, MAX_OPERATION_LENGTH);
        assert_eq!(
            validate_metadata(
                &env,
                &GovernanceMetadata {
                    reason: max_reason,
                    operation: max_operation,
                },
            ),
            Ok(())
        );
    }

    #[test]
    fn public_event_metadata_matches_documented_abi() {
        let abi_docs = include_str!("../../docs/contract-abi-reference.md");

        for fixture in PUBLIC_EVENT_SCHEMA_FIXTURES {
            assert!(
                abi_docs.contains(fixture.event_name),
                "{} is missing from the ABI reference",
                fixture.event_name
            );
            for field in fixture.field_order {
                assert!(
                    abi_docs.contains(field),
                    "{} field {} is missing from the ABI reference",
                    fixture.event_name,
                    field
                );
            }
        }
    }
}
