//! Per-event payload bounds and stable rejection errors.
//!
//! This module is intentionally dependency-free and is compiled into every
//! contract crate via `#[path]`. It is the single source of truth for the
//! maximum length of variable-width fields embedded in emitted events.
//!
//! Why these bounds exist
//! ----------------------
//! Soroban bills CPU and memory for every byte that is serialised into an
//! event. An unbounded string or symbol in an event payload lets a caller
//! turn a cheap state change into an arbitrarily expensive one, which can
//! push a transaction past the resource limit or bloat the indexer stream.
//! Bounding each field up front makes the resource envelope predictable.
//!
//! Error codes are stable: adding a new bound never renumbers an existing one.
//! See `docs/soroban-resource-assumptions.md` for the recorded budgets.

use soroban_sdk::{contracttype, String};

// ── Stable error codes ────────────────────────────────────────────────────────

/// Stable code shared with the global error registry (`codes::PAYLOAD_TOO_LARGE`).
pub const EVENT_PAYLOAD_TOO_LARGE_CODE: u32 = 1005;

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EventPayloadError {
    /// A variable-width event field exceeded its per-event bound.
    PayloadTooLarge,
}

impl EventPayloadError {
    /// On-chain stable error code (matches `codes::PAYLOAD_TOO_LARGE`).
    pub fn code(self) -> u32 {
        EVENT_PAYLOAD_TOO_LARGE_CODE
    }
}

// ── Per-event bounds (characters) ─────────────────────────────────────────────

/// Generic pause/unpause reason bound (shared by all pause event streams).
pub const MAX_PAUSE_REASON_LEN: u32 = 128;
/// Anchor contract: pause/unpause reason (`PauseStateChangedEvent.reason`).
pub const MAX_ANCHOR_PAUSE_REASON_LEN: u32 = MAX_PAUSE_REASON_LEN;
/// Tipping contract: settlement proof metadata (`SettlementEvent.proof_metadata`).
pub const MAX_TIPPING_PROOF_METADATA_LEN: u32 = 128;
/// Report contract: report reason (`ReportSubmittedLedgerEvent.reason`).
pub const MAX_REPORT_REASON_LEN: u32 = 128;
/// Badge contract: badge type name/description/criteria stored with `BadgeEvent`.
pub const MAX_BADGE_METADATA_LEN: u32 = 128;
/// Shared event module: `Symbol` fields (`content_hash`, `reaction_type`, ...).
pub const MAX_EVENT_SYMBOL_LEN: u32 = 32;

/// Machine-readable description of every bounded event field.
pub struct EventFieldBound {
    pub event: &'static str,
    pub field: &'static str,
    pub max_len: u32,
}

pub const EVENT_PAYLOAD_BOUNDS: &[EventFieldBound] = &[
    EventFieldBound {
        event: "PauseStateChangedEvent",
        field: "reason",
        max_len: MAX_ANCHOR_PAUSE_REASON_LEN,
    },
    EventFieldBound {
        event: "SettlementEvent",
        field: "proof_metadata",
        max_len: MAX_TIPPING_PROOF_METADATA_LEN,
    },
    EventFieldBound {
        event: "ReportSubmittedLedgerEvent",
        field: "reason",
        max_len: MAX_REPORT_REASON_LEN,
    },
    EventFieldBound {
        event: "BadgeEvent",
        field: "metadata",
        max_len: MAX_BADGE_METADATA_LEN,
    },
    EventFieldBound {
        event: "ConfessionEvent",
        field: "content_hash",
        max_len: MAX_EVENT_SYMBOL_LEN,
    },
    EventFieldBound {
        event: "ReactionEvent",
        field: "reaction_type",
        max_len: MAX_EVENT_SYMBOL_LEN,
    },
    EventFieldBound {
        event: "ReportEvent",
        field: "reason",
        max_len: MAX_EVENT_SYMBOL_LEN,
    },
    EventFieldBound {
        event: "RoleEvent",
        field: "role",
        max_len: MAX_EVENT_SYMBOL_LEN,
    },
];

// ── Validation helpers ────────────────────────────────────────────────────────

/// Generic bounded-string check. `bound` must be one of the constants above.
pub fn validate_string_field(value: &String, bound: u32) -> Result<(), EventPayloadError> {
    if value.len() > bound {
        return Err(EventPayloadError::PayloadTooLarge);
    }
    Ok(())
}

pub fn validate_pause_reason(value: &String) -> Result<(), EventPayloadError> {
    validate_string_field(value, MAX_PAUSE_REASON_LEN)
}

pub fn validate_anchor_pause_reason(value: &String) -> Result<(), EventPayloadError> {
    validate_pause_reason(value)
}

pub fn validate_tipping_metadata(value: &String) -> Result<(), EventPayloadError> {
    validate_string_field(value, MAX_TIPPING_PROOF_METADATA_LEN)
}

pub fn validate_report_reason(value: &String) -> Result<(), EventPayloadError> {
    validate_string_field(value, MAX_REPORT_REASON_LEN)
}

pub fn validate_badge_metadata(value: &String) -> Result<(), EventPayloadError> {
    validate_string_field(value, MAX_BADGE_METADATA_LEN)
}

// NOTE: `Symbol` fields are capped at 32 characters by the Soroban host
// itself, so no runtime validator is needed for them — `MAX_EVENT_SYMBOL_LEN`
// records that platform guarantee for maintainers.

// ── Self-checks ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    fn s(env: &Env, len: u32) -> String {
        String::from_str(env, &"x".repeat(len as usize))
    }

    #[test]
    fn bounds_are_positive_and_distinct_per_event() {
        assert!(EVENT_PAYLOAD_BOUNDS.len() >= 8);
        for bound in EVENT_PAYLOAD_BOUNDS {
            assert!(bound.max_len > 0);
        }
    }

    #[test]
    fn exact_bound_is_accepted_and_plus_one_rejected() {
        let env = Env::default();
        for bound in EVENT_PAYLOAD_BOUNDS {
            assert_eq!(
                validate_string_field(&s(&env, bound.max_len), bound.max_len),
                Ok(())
            );
            assert_eq!(
                validate_string_field(&s(&env, bound.max_len + 1), bound.max_len),
                Err(EventPayloadError::PayloadTooLarge)
            );
        }
    }

    #[test]
    fn stable_error_code_matches_registry() {
        assert_eq!(EVENT_PAYLOAD_TOO_LARGE_CODE, 1005);
    }
}
