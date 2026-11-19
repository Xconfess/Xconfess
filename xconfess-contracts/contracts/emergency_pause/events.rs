//! Emergency-pause event schemas.
//!
//! Two schema generations are kept side by side:
//!
//! * **V1** (`PausedEvent` / `UnpausedEvent`) — published by pre-traceability
//!   deployments. The structs are retained so historical on-chain events can
//!   still be decoded; the topics and payload shape are never changed.
//! * **V2** (`PauseStateChangedEvent`) — the current schema. It carries the
//!   acting `actor`, the free-form `reason`, a **monotonic** `nonce`, an
//!   explicit `event_version` discriminator, the resulting `paused` state and
//!   the ledger `timestamp`. It is emitted on a dedicated topic so indexers
//!   can route it without colliding with V1 streams.
//!
//! See `docs/contract-abi-reference.md` § "Public Event Schema Fixtures" and
//! `docs/contract-event-version-bump-checklist.md` before changing any schema.

use soroban_sdk::{contractevent, Address, Env, String};

use crate::emergency_pause::errors::PauseError;
use crate::emergency_pause::storage::DataKey;

// ── Bounds ────────────────────────────────────────────────────────────────────

/// Maximum length, in characters, of a pause/unpause reason string.
pub const MAX_PAUSE_REASON_LEN: u32 = 128;
/// Stable, machine-readable rejection reason for an oversized pause reason.
pub const PAUSE_REASON_TOO_LONG: &str = "pause reason too long";

// ── Schema versions / topics ──────────────────────────────────────────────────

/// Legacy schema version (events without an explicit `event_version` field).
pub const PAUSE_EVENT_VERSION_V1: u32 = 1;
/// Current schema version for enriched pause state-change events.
pub const PAUSE_EVENT_VERSION_V2: u32 = 2;
/// Dedicated topic for the versioned, traceable pause event.
pub const PAUSE_STATE_CHANGED_TOPIC: &str = "pause_state_changed";

// ── V1 schemas (frozen — decode-only) ─────────────────────────────────────────

#[contractevent(topics = ["paused"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PausedEvent {
    #[topic]
    pub actor: Address,
    pub reason: String,
}

#[contractevent(topics = ["unpaused"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnpausedEvent {
    #[topic]
    pub actor: Address,
    pub reason: String,
}

// ── V2 schema (current) ───────────────────────────────────────────────────────

/// Enriched pause-state event carrying full operational traceability.
///
/// Field order is part of the public ABI — see the fixture table in
/// `docs/contract-abi-reference.md` before reordering anything.
#[contractevent(topics = ["pause_state_changed"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseStateChangedEvent {
    pub event_version: u32,
    pub actor: Address,
    pub reason: String,
    pub nonce: u64,
    pub paused: bool,
    pub timestamp: u64,
}

// ── Validation (stable error, no panics) ──────────────────────────────────────

/// Validate a pause reason against the per-event bound.
///
/// Returns a stable `PauseError::ReasonTooLong` instead of panicking so that
/// callers (and downstream consumers) can branch on a known error code.
pub fn validate_pause_reason(reason: &String) -> Result<(), PauseError> {
    if reason.len() > MAX_PAUSE_REASON_LEN {
        return Err(PauseError::ReasonTooLong);
    }
    Ok(())
}

// ── Monotonic nonce ───────────────────────────────────────────────────────────

/// Read the current pause-event nonce (0 when no pause action has occurred).
pub fn latest_pause_nonce(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::PauseEventNonce)
        .unwrap_or(0_u64)
}

/// Increment and return the next pause-event nonce.
fn bump_pause_nonce(env: &Env) -> u64 {
    let next = latest_pause_nonce(env)
        .checked_add(1)
        .expect("pause event nonce overflow");
    env.storage()
        .instance()
        .set(&DataKey::PauseEventNonce, &next);
    next
}

// ── Emission ──────────────────────────────────────────────────────────────────

fn emit_state_change(env: &Env, actor: &Address, reason: String, paused: bool) {
    let nonce = bump_pause_nonce(env);
    PauseStateChangedEvent {
        event_version: PAUSE_EVENT_VERSION_V2,
        actor: actor.clone(),
        reason,
        nonce,
        paused,
        timestamp: env.ledger().timestamp(),
    }
    .publish(env);
}

pub fn emit_paused(env: &Env, actor: &Address, reason: String) -> Result<(), PauseError> {
    validate_pause_reason(&reason)?;
    emit_state_change(env, actor, reason, true);
    Ok(())
}

pub fn emit_unpaused(env: &Env, actor: &Address, reason: String) -> Result<(), PauseError> {
    validate_pause_reason(&reason)?;
    emit_state_change(env, actor, reason, false);
    Ok(())
}
