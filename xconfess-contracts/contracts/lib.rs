use soroban_sdk::{Address, Env, Symbol};

pub mod events;
pub mod pagination;
pub mod report;

// Define deterministic errors
pub const ERR_DUPLICATE_REPORT: &str = "duplicate_report";
pub const ERR_COOLDOWN_ACTIVE: &str = "cooldown_active";
pub const ERR_REASON_EMPTY: &str = "reason_empty";
pub const ERR_REASON_TOO_LONG: &str = "reason_too_long";

// Helper for generating a key for actor-confession mapping
pub fn report_key(actor: &Symbol, confession_id: &Symbol) -> Vec<u8> {
    [actor.as_bytes(), confession_id.as_bytes()].concat()
}

// Read helpers for indexer reconciliation.
pub fn latest_confession_event_nonce(env: &Env, confession_id: u64) -> u64 {
    events::latest_confession_nonce(env, confession_id)
}

pub fn latest_reaction_event_nonce(env: &Env, confession_id: u64) -> u64 {
    events::latest_reaction_nonce(env, confession_id)
}

pub fn latest_report_event_nonce(env: &Env, confession_id: u64) -> u64 {
    events::latest_report_nonce(env, confession_id)
}

pub fn latest_role_event_nonce(env: &Env, user: Address, role: Symbol) -> u64 {
    events::latest_role_nonce(env, user, role)
}

pub fn latest_governance_event_nonce(env: &Env, stream: Symbol) -> u64 {
    events::latest_governance_nonce(env, stream)
}

pub fn latest_badge_event_nonce(env: &Env, badge_id: u64) -> u64 {
    events::latest_badge_nonce(env, badge_id)
}
