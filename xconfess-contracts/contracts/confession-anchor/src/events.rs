#![allow(dead_code)]

use soroban_sdk::{contracttype, BytesN, Env};

/// Bump when event payload shape/topic compatibility changes in a breaking way.
/// See `docs/contract-event-version-bump-checklist.md` for backend/fixture steps.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Topic emitted by `anchor_confession`.
pub const CONFESSION_ANCHORED_TOPIC: &str = "confession_anchor";

/// Event schema version for ConfessionAnchored event
pub const CONFESSION_ANCHORED_EVENT_VERSION: u32 = 1;

/// Event schema version for VersionCompatibilityChecked event
pub const VERSION_COMPATIBILITY_CHECKED_EVENT_VERSION: u32 = 1;

/// Event nonce keys for versioned event tracking
#[contracttype]
#[derive(Clone)]
pub enum EventNonceKey {
    ConfessionAnchor(BytesN<32>),
    VersionCompatibilityCheck(u32, u32, u32),
}

/// Read the current nonce value for a given key
pub fn read_nonce(env: &Env, key: &EventNonceKey) -> u64 {
    env.storage().instance().get(key).unwrap_or(0u64)
}

/// Increment and return the next nonce value for a given key
pub fn bump_nonce(env: &Env, key: EventNonceKey) -> u64 {
    let next = read_nonce(env, &key)
        .checked_add(1)
        .expect("event nonce overflow");
    env.storage().instance().set(&key, &next);
    next
}
