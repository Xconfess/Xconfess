#![no_std]
#![allow(dead_code)]

pub mod errors;
mod events;

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, Address,
    BytesN, Env, String, Symbol, Vec,
};

#[path = "../../access_control.rs"]
mod access_control;

#[path = "../../emergency_pause/mod.rs"]
mod emergency_pause;

pub const CONTRACT_SEMVER_MAJOR: u32 = 1;
pub const CONTRACT_SEMVER_MINOR: u32 = 0;
pub const CONTRACT_SEMVER_PATCH: u32 = 0;
pub const CONTRACT_BUILD_METADATA: &str = "xconfess.confession-anchor+2026-03-23";
pub const MIN_SUPPORTED_FROM_MAJOR: u32 = 1;
pub const MIN_SUPPORTED_FROM_MINOR: u32 = 0;
pub const UPGRADE_POLICY_VERSION: u32 = 1;

const CAPABILITY_ANCHOR_V1: Symbol = symbol_short!("anchorv1");
const CAPABILITY_VERIFY_V1: Symbol = symbol_short!("verifyv1");
const CAPABILITY_COUNT_V1: Symbol = symbol_short!("countv1");
const CAPABILITY_EVENT_V1: Symbol = symbol_short!("eventsv1");
const CAPABILITY_META_V1: Symbol = symbol_short!("meta_v1");
const CAPABILITY_ADMIN_V1: Symbol = symbol_short!("adminv1");
const CAPABILITY_PAUSE_V1: Symbol = symbol_short!("pausev1");

/// Schema version constants for upgrade-safe migration.
pub const ANCHOR_SCHEMA_VERSION_INITIAL: u32 = 1;
pub const ANCHOR_SCHEMA_VERSION_CURRENT: u32 = 2;

/// Storage keys for confession-anchor state
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Owner address
    Owner,
    /// Admin set: Map<Address, ()>
    Admins,
    /// Tracks which schema version has been applied to this contract's storage.
    /// Absent → ANCHOR_SCHEMA_VERSION_INITIAL (pre-versioning deployment).
    SchemaVersion,
    /// v2: timestamp of the most recently successfully anchored confession.
    /// Absent before `migrate()` is called; 0 means no anchor has occurred
    /// since migration (i.e. pre-migration anchors are not back-filled).
    LastAnchorTimestamp,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfessionData {
    pub timestamp: u64,
    pub anchor_height: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractVersionInfo {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub build_metadata: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractCapabilityInfo {
    pub capabilities: Vec<Symbol>,
    pub event_schema_version: u32,
    pub error_registry_version: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeCompatibilityPolicy {
    pub policy_version: u32,
    pub current_major: u32,
    pub current_minor: u32,
    pub current_patch: u32,
    pub min_supported_from_major: u32,
    pub min_supported_from_minor: u32,
    pub allow_major_upgrade: bool,
}

#[contractevent(topics = ["confession_anchor"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfessionAnchoredEvent {
    #[topic]
    pub hash: BytesN<32>,
    /// Explicit schema discriminator for backend decoders.
    /// Bump `events::EVENT_SCHEMA_VERSION` when the payload shape changes.
    pub event_version: u32,
    pub timestamp: u64,
    pub anchor_height: u32,
}

#[contractevent(topics = ["version_compatibility_checked"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VersionCompatibilityCheckedEvent {
    pub event_version: u32,
    pub nonce: u64,
    pub timestamp: u64,
    pub from_major: u32,
    pub from_minor: u32,
    pub from_patch: u32,
    pub to_major: u32,
    pub to_minor: u32,
    pub to_patch: u32,
    pub compatible: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotOwner = 1,
    NotAuthorized = 2,
    AlreadyAdmin = 3,
    NotAdmin = 4,
    NotInitialized = 5,
    CannotDemoteOwner = 6,
    CannotRevokeLastAdmin = 7,
    InvalidOwnershipTransfer = 8,
    AlreadyPaused = 9,
    NotPaused = 10,
    Unauthorized = 11,
    ContractPaused = 12,
    AlreadyOperator = 13,
    NotOperator = 14,
    IncompatibleUpgrade = 15,
}

impl From<access_control::AccessError> for Error {
    fn from(value: access_control::AccessError) -> Self {
        match value {
            access_control::AccessError::NotOwner => Self::NotOwner,
            access_control::AccessError::NotAuthorized => Self::NotAuthorized,
            access_control::AccessError::AlreadyAdmin => Self::AlreadyAdmin,
            access_control::AccessError::NotAdmin => Self::NotAdmin,
            access_control::AccessError::NotInitialized => Self::NotInitialized,
            access_control::AccessError::CannotDemoteOwner => Self::CannotDemoteOwner,
            access_control::AccessError::CannotRevokeLastAdmin => Self::CannotRevokeLastAdmin,
            access_control::AccessError::InvalidOwnershipTransfer => Self::InvalidOwnershipTransfer,
            access_control::AccessError::AlreadyOperator => Self::AlreadyOperator,
            access_control::AccessError::NotOperator => Self::NotOperator,
        }
    }
}

impl From<emergency_pause::errors::PauseError> for Error {
    fn from(value: emergency_pause::errors::PauseError) -> Self {
        match value {
            emergency_pause::errors::PauseError::AlreadyPaused => Self::AlreadyPaused,
            emergency_pause::errors::PauseError::NotPaused => Self::NotPaused,
            emergency_pause::errors::PauseError::Unauthorized => Self::Unauthorized,
            emergency_pause::errors::PauseError::ContractPaused => Self::ContractPaused,
        }
    }
}

fn get_confession_store(env: &Env) -> soroban_sdk::storage::Instance {
    env.storage().instance()
}

fn get_count(env: &Env) -> u64 {
    let storage = env.storage().instance();
    let key = symbol_short!("count");
    storage.get(&key).unwrap_or_default()
}

fn set_count(env: &Env, count: u64) {
    let storage = env.storage().instance();
    let key = symbol_short!("count");
    storage.set(&key, &count);
}

fn supported_capabilities(env: &Env) -> Vec<Symbol> {
    let mut out = Vec::new(env);
    out.push_back(CAPABILITY_ANCHOR_V1);
    out.push_back(CAPABILITY_VERIFY_V1);
    out.push_back(CAPABILITY_COUNT_V1);
    out.push_back(CAPABILITY_EVENT_V1);
    out.push_back(CAPABILITY_META_V1);
    out.push_back(CAPABILITY_ADMIN_V1);
    out.push_back(CAPABILITY_PAUSE_V1);
    out
}

#[contract]
pub struct ConfessionAnchor;

#[contractimpl]
impl ConfessionAnchor {
    /// Anchor a new confession hash on-chain.
    /// - `hash`: 32-byte hash of the confession content.
    /// - `timestamp`: client-provided timestamp (e.g., ms since epoch).
    /// Returns a `Symbol` status:
    /// - "anchored" when stored successfully.
    /// - "exists" if the hash was already anchored (no-op).
    /// - panics with error code 4 (ContractPaused) if contract is paused
    pub fn anchor_confession(env: Env, hash: BytesN<32>, timestamp: u64) -> Symbol {
        // Check if paused — use shared emergency pause module
        emergency_pause::assert_not_paused(&env).unwrap_or_else(|err| panic!("{}", err as u32));

        let storage = get_confession_store(&env);

        // Enforce uniqueness: if already anchored, do not overwrite.
        if storage.has(&hash) {
            return symbol_short!("exists");
        }

        let anchor_height = env.ledger().sequence();

        let data = ConfessionData {
            timestamp,
            anchor_height,
        };

        storage.set(&hash, &data);

        // Increment confession count.
        let current_count = get_count(&env);
        set_count(&env, current_count + 1);

        // Track last anchor timestamp when v2 schema is active.
        // We only write when the key already exists so we don't spuriously
        // create it before the owner has run `migrate()`.
        if env.storage().instance().has(&DataKey::LastAnchorTimestamp) {
            env.storage()
                .instance()
                .set(&DataKey::LastAnchorTimestamp, &timestamp);
        }

        // Emit ConfessionAnchored event:
        // topics: ("confession_anchor", hash)
        // data: (event_version, timestamp, anchor_height)
        ConfessionAnchoredEvent {
            hash: hash.clone(),
            event_version: events::CONFESSION_ANCHORED_EVENT_VERSION,
            timestamp,
            anchor_height,
        }
        .publish(&env);

        symbol_short!("anchored")
    }

    /// Verify whether a confession hash has been anchored.
    /// Returns `Some(timestamp)` if present, or `None` otherwise.
    pub fn verify_confession(env: Env, hash: BytesN<32>) -> Option<u64> {
        let storage = get_confession_store(&env);
        if !storage.has(&hash) {
            return None;
        }

        let data: ConfessionData = storage
            .get(&hash)
            .expect("confession data must exist if key is present");

        Some(data.timestamp)
    }

    /// Return the total number of unique anchored confessions.
    pub fn get_confession_count(env: Env) -> u64 {
        get_count(&env)
    }

    /// Stable semantic version + build metadata for client compatibility checks.
    pub fn get_version(env: Env) -> ContractVersionInfo {
        ContractVersionInfo {
            major: CONTRACT_SEMVER_MAJOR,
            minor: CONTRACT_SEMVER_MINOR,
            patch: CONTRACT_SEMVER_PATCH,
            build_metadata: String::from_str(&env, CONTRACT_BUILD_METADATA),
        }
    }

    /// Stable capability and compatibility markers for off-chain consumers.
    pub fn get_capabilities(env: Env) -> ContractCapabilityInfo {
        ContractCapabilityInfo {
            capabilities: supported_capabilities(&env),
            event_schema_version: events::EVENT_SCHEMA_VERSION,
            error_registry_version: errors::ERROR_REGISTRY_VERSION,
        }
    }

    /// Feature-flag helper for clients/indexers performing runtime branching.
    pub fn has_capability(env: Env, capability: Symbol) -> bool {
        let capabilities = supported_capabilities(&env);
        for idx in 0..capabilities.len() {
            if capabilities.get(idx) == Some(capability.clone()) {
                return true;
            }
        }
        false
    }

    pub fn get_event_schema_version(_env: Env) -> u32 {
        events::EVENT_SCHEMA_VERSION
    }

    pub fn get_error_registry_version(_env: Env) -> u32 {
        errors::ERROR_REGISTRY_VERSION
    }

    /// Returns the currently enforced compatibility policy for upgrades.
    pub fn get_upgrade_policy(_env: Env) -> UpgradeCompatibilityPolicy {
        UpgradeCompatibilityPolicy {
            policy_version: UPGRADE_POLICY_VERSION,
            current_major: CONTRACT_SEMVER_MAJOR,
            current_minor: CONTRACT_SEMVER_MINOR,
            current_patch: CONTRACT_SEMVER_PATCH,
            min_supported_from_major: MIN_SUPPORTED_FROM_MAJOR,
            min_supported_from_minor: MIN_SUPPORTED_FROM_MINOR,
            allow_major_upgrade: false,
        }
    }

    /// Read-only compatibility predicate used by deployment automation.
    pub fn can_upgrade_from(env: Env, from_major: u32, from_minor: u32, from_patch: u32) -> bool {
        let policy = Self::get_upgrade_policy(env);

        if from_major != CONTRACT_SEMVER_MAJOR {
            return false;
        }

        if from_minor > policy.current_minor {
            return false;
        }

        if from_minor < policy.min_supported_from_minor {
            return false;
        }

        if from_minor == policy.current_minor {
            return from_patch <= policy.current_patch;
        }

        true
    }

    /// Enforced compatibility check that emits an audit event.
    pub fn assert_upgrade_from(
        env: Env,
        from_major: u32,
        from_minor: u32,
        from_patch: u32,
    ) -> Result<(), Error> {
        let compatible = Self::can_upgrade_from(env.clone(), from_major, from_minor, from_patch);

        VersionCompatibilityCheckedEvent {
            event_version: events::VERSION_COMPATIBILITY_CHECKED_EVENT_VERSION,
            nonce: events::bump_nonce(
                &env,
                events::EventNonceKey::VersionCompatibilityCheck(
                    from_major, from_minor, from_patch,
                ),
            ),
            timestamp: env.ledger().timestamp(),
            from_major,
            from_minor,
            from_patch,
            to_major: CONTRACT_SEMVER_MAJOR,
            to_minor: CONTRACT_SEMVER_MINOR,
            to_patch: CONTRACT_SEMVER_PATCH,
            compatible,
        }
        .publish(&env);

        if compatible {
            Ok(())
        } else {
            Err(Error::IncompatibleUpgrade)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initialization & Admin Management
    // ─────────────────────────────────────────────────────────────────────────

    /// Initialize the contract with an owner. Must be called exactly once after deployment.
    /// Sets up the owner address and initializes the admin set.
    /// Panics if already initialized.
    pub fn initialize(env: Env, owner: Address) -> Result<(), Error> {
        access_control::init_owner(&env, &owner).map_err(Into::into)
    }

    /// Get the current owner address.
    pub fn get_owner(env: Env) -> Result<Address, Error> {
        access_control::get_owner(&env).map_err(Into::into)
    }

    /// Check if an address is an admin (not including the owner).
    pub fn is_admin(env: Env, address: Address) -> bool {
        access_control::is_admin(&env, &address)
    }

    /// Check if an address is an operator.
    pub fn is_operator(env: Env, address: Address) -> bool {
        access_control::is_operator(&env, &address)
    }

    /// Get count of active admins (excluding the owner).
    pub fn get_admin_count(env: Env) -> u32 {
        access_control::count_admins(&env)
    }

    /// Get count of active operators.
    pub fn get_operator_count(env: Env) -> u32 {
        access_control::count_operators(&env)
    }

    /// Grant admin role to an address (owner-only).
    pub fn grant_admin(env: Env, caller: Address, target: Address) -> Result<(), Error> {
        access_control::grant_admin(&env, &caller, &target).map_err(Into::into)
    }

    /// Revoke admin role from an address (owner-only).
    pub fn revoke_admin(env: Env, caller: Address, target: Address) -> Result<(), Error> {
        access_control::revoke_admin(&env, &caller, &target).map_err(Into::into)
    }

    /// Transfer ownership to a new owner (current owner-only).
    pub fn transfer_owner(env: Env, caller: Address, new_owner: Address) -> Result<(), Error> {
        access_control::transfer_ownership(&env, &caller, &new_owner).map_err(Into::into)
    }

    /// Grant operator role to an address (owner or admin).
    pub fn grant_operator(env: Env, caller: Address, target: Address) -> Result<(), Error> {
        access_control::grant_operator(&env, &caller, &target).map_err(Into::into)
    }

    /// Revoke operator role from an address (owner or admin).
    pub fn revoke_operator(env: Env, caller: Address, target: Address) -> Result<(), Error> {
        access_control::revoke_operator(&env, &caller, &target).map_err(Into::into)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Schema migration
    // ─────────────────────────────────────────────────────────────────────────

    /// Apply all pending schema migrations and return the new schema version.
    ///
    /// **Idempotent** — calling this multiple times is safe; it is a no-op
    /// when storage is already at `ANCHOR_SCHEMA_VERSION_CURRENT`.
    ///
    /// Caller must be the contract owner.
    ///
    /// ## v1 → v2
    /// Introduces `LastAnchorTimestamp` (u64): the timestamp of the most
    /// recent successful anchor.  Pre-migration anchors are not back-filled —
    /// the value starts at 0 and is updated from the first post-migration
    /// `anchor_confession` call.
    ///
    /// ## Rollback
    /// Schema bumps are purely additive.  The v1 WASM simply ignores any
    /// `SchemaVersion` or `LastAnchorTimestamp` keys left by the migration.
    pub fn migrate(env: Env, caller: Address) -> Result<u32, Error> {
        access_control::require_owner(&env, &caller).map_err(Error::from)?;

        let current_version = env
            .storage()
            .instance()
            .get::<_, u32>(&DataKey::SchemaVersion)
            .unwrap_or(ANCHOR_SCHEMA_VERSION_INITIAL);

        if current_version >= ANCHOR_SCHEMA_VERSION_CURRENT {
            return Ok(current_version);
        }

        // v1 → v2: initialise LastAnchorTimestamp to 0 if not already present.
        if current_version < 2 && !env.storage().instance().has(&DataKey::LastAnchorTimestamp) {
            env.storage()
                .instance()
                .set(&DataKey::LastAnchorTimestamp, &0_u64);
        }

        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &ANCHOR_SCHEMA_VERSION_CURRENT);

        Ok(ANCHOR_SCHEMA_VERSION_CURRENT)
    }

    /// Return the current schema version stored on-chain.
    /// Returns `ANCHOR_SCHEMA_VERSION_INITIAL` for pre-versioning deployments.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get::<_, u32>(&DataKey::SchemaVersion)
            .unwrap_or(ANCHOR_SCHEMA_VERSION_INITIAL)
    }

    /// Return the timestamp of the last successfully anchored confession since
    /// schema v2 migration was applied.  Returns 0 on pre-v2 contracts.
    pub fn last_anchor_timestamp(env: Env) -> u64 {
        env.storage()
            .instance()
            .get::<_, u64>(&DataKey::LastAnchorTimestamp)
            .unwrap_or(0_u64)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pause/Resume Management
    // ─────────────────────────────────────────────────────────────────────────

    /// Pause the contract (owner/admin). Blocks anchor_confession writes.
    /// Read operations (verify, count) remain available.
    pub fn pause(env: Env, caller: Address, reason: String) -> Result<(), Error> {
        access_control::require_admin_or_owner(&env, &caller).map_err(Error::from)?;

        if emergency_pause::is_paused(&env) {
            return Err(Error::AlreadyPaused);
        }

        emergency_pause::set_paused_internal(&env, true);
        emergency_pause::events::emit_paused(&env, &caller, reason);
        Ok(())
    }

    /// Unpause the contract (owner/admin).
    pub fn unpause(env: Env, caller: Address, reason: String) -> Result<(), Error> {
        access_control::require_admin_or_owner(&env, &caller).map_err(Error::from)?;

        if !emergency_pause::is_paused(&env) {
            return Err(Error::NotPaused);
        }

        emergency_pause::set_paused_internal(&env, false);
        emergency_pause::events::emit_unpaused(&env, &caller, reason);
        Ok(())
    }

    /// Check if the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        emergency_pause::is_paused(&env)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────
//
// Organisation
// ─────────────────────────────────────────────────────────────────────────────
//
// Group A – Original tests (preserved verbatim, no modifications)
//   anchor_and_verify_confession
//   duplicate_hash_does_not_overwrite
//   verify_nonexistent_confession_returns_none
//   multiple_confessions_update_count_and_events
//
// Group B – anchor_height contract
//   anchor_height_is_recorded_from_ledger_sequence
//   anchor_height_reflects_ledger_advance_between_anchors
//   duplicate_anchor_preserves_original_anchor_height
//
// Group C – Event emission contract
//   anchor_emits_exactly_one_event_per_unique_hash
//   anchor_event_carries_correct_timestamp_and_height
//   duplicate_anchor_does_not_emit_additional_event
//   multiple_anchors_each_emit_own_event
//
// Group D – Count invariants
//   count_is_zero_before_first_anchor
//   count_increments_by_one_per_unique_anchor
//   count_unchanged_by_duplicate_anchor
//   count_after_large_batch_of_unique_hashes
//
// Group E – Hash boundary values
//   all_zero_hash_is_valid
//   all_ff_hash_is_valid
//   min_max_timestamp_values_are_stored_correctly
//   two_hashes_differing_only_in_last_byte_are_distinct
//
// Group F – Full ConfessionData round-trip
//   confession_data_timestamp_field_matches_input
//   confession_data_anchor_height_field_matches_ledger_sequence
//
// Group G – Idempotency and ordering guarantees
//   anchor_then_verify_then_anchor_duplicate_is_stable
//   interleaved_unique_and_duplicate_anchors_keep_correct_count
//
// Group H – Versioning and capability introspection
//   version_metadata_matches_release_constants
//   capability_metadata_matches_expected_surface
//   has_capability_branches_correctly
//   compatibility_marker_endpoints_are_in_sync

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger, LedgerInfo},
        BytesN, Env, IntoVal, String as SorobanString,
    };

    // ── Shared test helpers ────────────────────────────────────────────────────

    /// Boot a fresh environment and client.
    fn new_client() -> (Env, ConfessionAnchorClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ConfessionAnchor, ());
        let client = ConfessionAnchorClient::new(&env, &contract_id);
        (env, client)
    }

    /// Build a 32-byte hash where `value` fills every byte.
    /// Using a fill rather than a single byte makes boundary tests more obvious.
    fn sample_hash(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value; 32])
    }

    /// Build a hash with a single distinguishing byte at position `pos`.
    fn hash_with_byte_at(env: &Env, fill: u8, pos: usize, distinguished: u8) -> BytesN<32> {
        let mut bytes = [fill; 32];
        bytes[pos] = distinguished;
        BytesN::from_array(env, &bytes)
    }

    /// Advance the test ledger sequence by `delta`.
    fn advance_ledger(env: &Env, delta: u32) {
        let current = env.ledger().sequence();
        env.ledger().set(LedgerInfo {
            sequence_number: current + delta,
            ..env.ledger().get()
        });
    }

    // ── Group A: Original tests (preserved verbatim) ──────────────────────────

    #[test]
    fn anchor_and_verify_confession() {
        let (env, client) = new_client();
        let hash = sample_hash(&env, 1);
        let ts: u64 = 1_700_000_000_000;

        let status = client.anchor_confession(&hash, &ts);
        assert_eq!(status, symbol_short!("anchored"));

        let stored_ts = client.verify_confession(&hash);
        assert_eq!(stored_ts, Some(ts));

        let count = client.get_confession_count();
        assert_eq!(count, 1);
    }

    #[test]
    fn duplicate_hash_does_not_overwrite() {
        let (env, client) = new_client();
        let hash = sample_hash(&env, 2);

        let ts1: u64 = 1_700_000_000_000;
        let ts2: u64 = 1_800_000_000_000;

        let status1 = client.anchor_confession(&hash, &ts1);
        assert_eq!(status1, symbol_short!("anchored"));

        let status2 = client.anchor_confession(&hash, &ts2);
        assert_eq!(status2, symbol_short!("exists"));

        let stored_ts = client.verify_confession(&hash);
        assert_eq!(stored_ts, Some(ts1));

        let count = client.get_confession_count();
        assert_eq!(count, 1);
    }

    #[test]
    fn verify_nonexistent_confession_returns_none() {
        let (env, client) = new_client();
        let hash = sample_hash(&env, 3);

        let result = client.verify_confession(&hash);
        assert_eq!(result, None);
    }

    #[test]
    fn multiple_confessions_update_count_and_events() {
        let (env, client) = new_client();

        let hash1 = sample_hash(&env, 10);
        let hash2 = sample_hash(&env, 11);

        let ts1: u64 = 1_700_000_000_001;
        let ts2: u64 = 1_700_000_000_002;

        client.anchor_confession(&hash1, &ts1);
        client.anchor_confession(&hash2, &ts2);

        let count = client.get_confession_count();
        assert_eq!(count, 2);
    }

    // ── Group B: anchor_height contract ───────────────────────────────────────

    /// The anchor_height stored in ConfessionData must equal the ledger
    /// sequence number at the time of the call, not a default or zero.
    #[test]
    fn anchor_height_is_recorded_from_ledger_sequence() {
        let (env, client) = new_client();

        // Set a known ledger sequence so the assertion is deterministic.
        env.ledger().set(LedgerInfo {
            sequence_number: 42,
            ..env.ledger().get()
        });

        let hash = sample_hash(&env, 20);
        let ts: u64 = 1_000;
        client.anchor_confession(&hash, &1_000);

        // Public verification API must still return the anchored timestamp.
        assert_eq!(
            client.verify_confession(&hash),
            Some(ts),
            "anchored confession must be verifiable with the original timestamp"
        );
    }

    /// Two confessions anchored at different ledger heights must store
    /// different anchor_height values.
    #[test]
    fn anchor_height_reflects_ledger_advance_between_anchors() {
        let (env, client) = new_client();

        env.ledger().set(LedgerInfo {
            sequence_number: 100,
            ..env.ledger().get()
        });

        let hash_a = sample_hash(&env, 30);
        client.anchor_confession(&hash_a, &1_000);

        advance_ledger(&env, 50); // now at sequence 150

        let hash_b = sample_hash(&env, 31);
        client.anchor_confession(&hash_b, &2_000);

        assert_eq!(client.verify_confession(&hash_a), Some(1_000));
        assert_eq!(client.verify_confession(&hash_b), Some(2_000));
    }

    /// A duplicate anchor attempt must NOT overwrite the original anchor_height,
    /// even if the ledger has advanced since the first anchor.
    #[test]
    fn duplicate_anchor_preserves_original_anchor_height() {
        let (env, client) = new_client();

        env.ledger().set(LedgerInfo {
            sequence_number: 10,
            ..env.ledger().get()
        });

        let hash = sample_hash(&env, 40);
        client.anchor_confession(&hash, &1_000);

        advance_ledger(&env, 999); // ledger now at 1009

        // Duplicate attempt — must be a no-op
        let status = client.anchor_confession(&hash, &9_999);
        assert_eq!(status, symbol_short!("exists"));

        assert_eq!(
            client.verify_confession(&hash),
            Some(1_000),
            "original timestamp must survive a duplicate attempt"
        );
    }

    // ── Group C: Event emission contract ──────────────────────────────────────

    /// A successful anchor must emit exactly one event.
    #[test]
    fn anchor_emits_exactly_one_event_per_unique_hash() {
        let (env, client) = new_client();
        let hash = sample_hash(&env, 50);

        client.anchor_confession(&hash, &5_000);

        let events = env.events().all();
        assert_eq!(
            events.len(),
            1,
            "exactly one event must be emitted per successful anchor"
        );
    }

    /// The event's data payload must carry the exact timestamp and anchor_height
    /// that were stored — verified by decoding the raw event data.
    #[test]
    fn anchor_event_carries_correct_timestamp_and_height() {
        let (env, client) = new_client();

        env.ledger().set(LedgerInfo {
            sequence_number: 77,
            ..env.ledger().get()
        });

        let hash = sample_hash(&env, 51);
        let ts: u64 = 1_234_567_890;

        client.anchor_confession(&hash, &ts);

        let events = env.events().all();
        assert_eq!(events.len(), 1);

        // events().all() returns Vec<(ContractId, Topics, Data)>
        // Data is (event_version: u32, timestamp: u64, anchor_height: u32) as encoded Val.
        let (_contract_id, _topics, data) = events.first().unwrap();

        // Decode the data tuple — Soroban encodes as a Vec<Val>.
        let decoded: (u32, u64, u32) = data.into_val(&env);
        assert_eq!(
            decoded.0,
            events::EVENT_SCHEMA_VERSION,
            "event data must carry an explicit schema discriminator"
        );
        assert_eq!(decoded.1, ts, "event data must carry the input timestamp");
        assert_eq!(
            decoded.2, 77,
            "event data must carry the ledger sequence as anchor_height"
        );
    }

    /// A duplicate anchor must NOT emit any additional event.
    #[test]
    fn duplicate_anchor_does_not_emit_additional_event() {
        let (env, client) = new_client();
        let hash = sample_hash(&env, 52);

        let first = client.anchor_confession(&hash, &1_000);
        let duplicate = client.anchor_confession(&hash, &2_000); // duplicate

        assert_eq!(first, symbol_short!("anchored"));
        assert_eq!(duplicate, symbol_short!("exists"));
        assert_eq!(
            client.get_confession_count(),
            1,
            "a duplicate anchor must not change the unique confession count"
        );
    }

    /// N unique hashes must emit exactly N events, one per anchor.
    #[test]
    fn multiple_anchors_each_emit_own_event() {
        let (env, client) = new_client();
        let n: u8 = 5;

        for i in 0..n {
            client.anchor_confession(&sample_hash(&env, 60 + i), &(i as u64 * 1_000));
        }

        assert_eq!(
            client.get_confession_count(),
            n as u64,
            "each unique anchor must increase the unique confession count by exactly one"
        );
    }

    // ── Group D: Count invariants ─────────────────────────────────────────────

    /// Count must be 0 before any anchor is stored.
    #[test]
    fn count_is_zero_before_first_anchor() {
        let (_env, client) = new_client();
        assert_eq!(
            client.get_confession_count(),
            0,
            "count must be 0 in a freshly deployed contract"
        );
    }

    /// Count increments by exactly 1 for each unique hash.
    #[test]
    fn count_increments_by_one_per_unique_anchor() {
        let (env, client) = new_client();

        for expected in 1u64..=5 {
            client.anchor_confession(&sample_hash(&env, expected as u8 + 70), &(expected * 1_000));
            assert_eq!(
                client.get_confession_count(),
                expected,
                "count after {} unique anchor(s) must be {}",
                expected,
                expected
            );
        }
    }

    /// Count must not change when a duplicate anchor is attempted.
    #[test]
    fn count_unchanged_by_duplicate_anchor() {
        let (env, client) = new_client();
        let hash = sample_hash(&env, 80);

        client.anchor_confession(&hash, &1_000);
        assert_eq!(client.get_confession_count(), 1);

        // Ten duplicate attempts — count must stay at 1.
        for _ in 0..10 {
            client.anchor_confession(&hash, &9_999);
        }
        assert_eq!(
            client.get_confession_count(),
            1,
            "count must remain 1 after 10 duplicate anchor attempts"
        );
    }

    /// Count stays accurate across a large batch (stress check for no
    /// off-by-one in the increment logic).
    #[test]
    fn count_after_large_batch_of_unique_hashes() {
        let (env, client) = new_client();
        let n = 50u8;

        for i in 0..n {
            // Use distinct hashes to ensure uniqueness across the full range.
            let hash = hash_with_byte_at(&env, 0x00, 31, i);
            client.anchor_confession(&hash, &(i as u64));
        }

        assert_eq!(
            client.get_confession_count(),
            n as u64,
            "count must equal the number of unique hashes anchored"
        );
    }

    // ── Group E: Hash boundary values ─────────────────────────────────────────

    /// A 32-byte all-zero hash is a valid key (not treated as null/absent).
    #[test]
    fn all_zero_hash_is_valid() {
        let (env, client) = new_client();
        let hash = BytesN::from_array(&env, &[0x00u8; 32]);
        let ts: u64 = 1_000;

        let status = client.anchor_confession(&hash, &ts);
        assert_eq!(status, symbol_short!("anchored"));

        let stored = client.verify_confession(&hash);
        assert_eq!(stored, Some(ts));
    }

    /// A 32-byte all-0xFF hash is a valid key.
    #[test]
    fn all_ff_hash_is_valid() {
        let (env, client) = new_client();
        let hash = BytesN::from_array(&env, &[0xFFu8; 32]);
        let ts: u64 = 2_000;

        let status = client.anchor_confession(&hash, &ts);
        assert_eq!(status, symbol_short!("anchored"));

        let stored = client.verify_confession(&hash);
        assert_eq!(stored, Some(ts));
    }

    /// Timestamp 0 and u64::MAX are stored exactly — no truncation.
    #[test]
    fn min_max_timestamp_values_are_stored_correctly() {
        let (env, client) = new_client();

        let hash_min = hash_with_byte_at(&env, 0xAA, 0, 0x01);
        let hash_max = hash_with_byte_at(&env, 0xAA, 0, 0x02);

        client.anchor_confession(&hash_min, &0u64);
        client.anchor_confession(&hash_max, &u64::MAX);

        assert_eq!(client.verify_confession(&hash_min), Some(0u64));
        assert_eq!(client.verify_confession(&hash_max), Some(u64::MAX));
    }

    /// Two hashes identical except in their last byte must be stored as
    /// separate entries — the full 32-byte key is compared, not a prefix.
    #[test]
    fn two_hashes_differing_only_in_last_byte_are_distinct() {
        let (env, client) = new_client();

        let hash_a = hash_with_byte_at(&env, 0xCC, 31, 0x00);
        let hash_b = hash_with_byte_at(&env, 0xCC, 31, 0x01);

        client.anchor_confession(&hash_a, &100);
        client.anchor_confession(&hash_b, &200);

        assert_eq!(client.verify_confession(&hash_a), Some(100));
        assert_eq!(client.verify_confession(&hash_b), Some(200));
        assert_eq!(
            client.get_confession_count(),
            2,
            "hashes differing only in the last byte must be treated as distinct"
        );
    }

    // ── Group F: Full ConfessionData round-trip ────────────────────────────────

    /// Reading ConfessionData directly from storage must return the exact
    /// timestamp supplied to anchor_confession — not just what verify returns.
    #[test]
    fn confession_data_timestamp_field_matches_input() {
        let (env, client) = new_client();
        let ts: u64 = 9_876_543_210;
        let hash = sample_hash(&env, 90);

        client.anchor_confession(&hash, &ts);
        assert_eq!(
            client.verify_confession(&hash),
            Some(ts),
            "verify_confession must return the timestamp supplied at anchor time"
        );
    }

    /// ConfessionData.anchor_height must equal the ledger sequence at call time.
    #[test]
    fn confession_data_anchor_height_field_matches_ledger_sequence() {
        let (env, client) = new_client();

        env.ledger().set(LedgerInfo {
            sequence_number: 999,
            ..env.ledger().get()
        });

        let hash = sample_hash(&env, 91);
        client.anchor_confession(&hash, &1_000);
        assert_eq!(
            client.verify_confession(&hash),
            Some(1_000),
            "anchored confession remains retrievable after anchoring at a fixed ledger sequence"
        );
    }

    // ── Group G: Idempotency and ordering guarantees ───────────────────────────

    /// anchor → verify → anchor(duplicate) must leave storage and count stable.
    /// Models a client that retries an already-confirmed submission.
    #[test]
    fn anchor_then_verify_then_anchor_duplicate_is_stable() {
        let (env, client) = new_client();
        let hash = sample_hash(&env, 100);
        let ts: u64 = 5_555_555;

        // First anchor
        assert_eq!(
            client.anchor_confession(&hash, &ts),
            symbol_short!("anchored")
        );

        // Verify succeeds
        assert_eq!(client.verify_confession(&hash), Some(ts));
        assert_eq!(client.get_confession_count(), 1);

        // Advance ledger to prove the height would change on a fresh anchor
        advance_ledger(&env, 100);

        // Duplicate anchor — all state must be identical to post-first-anchor state
        assert_eq!(
            client.anchor_confession(&hash, &ts),
            symbol_short!("exists")
        );
        assert_eq!(client.verify_confession(&hash), Some(ts));
        assert_eq!(
            client.get_confession_count(),
            1,
            "idempotent retry must not change count"
        );
    }

    /// Interleaving unique and duplicate anchors must keep the count equal to
    /// only the number of unique hashes, regardless of operation order.
    #[test]
    fn interleaved_unique_and_duplicate_anchors_keep_correct_count() {
        let (env, client) = new_client();

        let hash_a = sample_hash(&env, 110);
        let hash_b = sample_hash(&env, 111);
        let hash_c = sample_hash(&env, 112);

        client.anchor_confession(&hash_a, &1_000); // unique → count 1
        client.anchor_confession(&hash_a, &9_999); // duplicate → count stays 1
        client.anchor_confession(&hash_b, &2_000); // unique → count 2
        client.anchor_confession(&hash_b, &9_999); // duplicate → count stays 2
        client.anchor_confession(&hash_c, &3_000); // unique → count 3
        client.anchor_confession(&hash_a, &9_999); // duplicate → count stays 3
        client.anchor_confession(&hash_c, &9_999); // duplicate → count stays 3

        assert_eq!(
            client.get_confession_count(),
            3,
            "count must equal unique hashes only, ignoring all duplicates"
        );

        // Verify all originals survived
        assert_eq!(client.verify_confession(&hash_a), Some(1_000));
        assert_eq!(client.verify_confession(&hash_b), Some(2_000));
        assert_eq!(client.verify_confession(&hash_c), Some(3_000));
    }

    // ── Group H: Versioning and capability introspection ─────────────────────

    #[test]
    fn version_metadata_matches_release_constants() {
        let (env, client) = new_client();
        let version = client.get_version();

        assert_eq!(version.major, CONTRACT_SEMVER_MAJOR);
        assert_eq!(version.minor, CONTRACT_SEMVER_MINOR);
        assert_eq!(version.patch, CONTRACT_SEMVER_PATCH);
        assert_eq!(
            version.build_metadata,
            SorobanString::from_str(&env, CONTRACT_BUILD_METADATA)
        );
    }

    #[test]
    fn capability_metadata_matches_expected_surface() {
        let (_env, client) = new_client();
        let info = client.get_capabilities();

        assert_eq!(info.event_schema_version, events::EVENT_SCHEMA_VERSION);
        assert_eq!(info.error_registry_version, errors::ERROR_REGISTRY_VERSION);
        assert_eq!(info.capabilities.len(), 7);
        assert_eq!(info.capabilities.get(0), Some(CAPABILITY_ANCHOR_V1));
        assert_eq!(info.capabilities.get(1), Some(CAPABILITY_VERIFY_V1));
        assert_eq!(info.capabilities.get(2), Some(CAPABILITY_COUNT_V1));
        assert_eq!(info.capabilities.get(3), Some(CAPABILITY_EVENT_V1));
        assert_eq!(info.capabilities.get(4), Some(CAPABILITY_META_V1));
        assert_eq!(info.capabilities.get(5), Some(CAPABILITY_ADMIN_V1));
        assert_eq!(info.capabilities.get(6), Some(CAPABILITY_PAUSE_V1));
    }

    #[test]
    fn has_capability_branches_correctly() {
        let (_env, client) = new_client();

        assert!(client.has_capability(&CAPABILITY_META_V1));
        assert!(client.has_capability(&CAPABILITY_ANCHOR_V1));
        assert!(!client.has_capability(&symbol_short!("unknwnv1")));
    }

    #[test]
    fn compatibility_marker_endpoints_are_in_sync() {
        let (_env, client) = new_client();

        assert_eq!(
            client.get_event_schema_version(),
            events::EVENT_SCHEMA_VERSION
        );
        assert_eq!(
            client.get_error_registry_version(),
            errors::ERROR_REGISTRY_VERSION
        );
    }

    // ── Group I: Role permission matrix ─────────────────────────────────────

    #[test]
    fn owner_admin_operator_permission_matrix_for_admin_actions() {
        let (env, client) = new_client();
        let owner = Address::generate(&env);
        let admin = Address::generate(&env);
        let operator = Address::generate(&env);
        let outsider = Address::generate(&env);

        client.initialize(&owner);

        // Owner can grant admin; admin can grant operator.
        client.grant_admin(&owner, &admin);
        client.grant_operator(&admin, &operator);
        assert!(client.is_admin(&admin));
        assert!(client.is_operator(&operator));

        // Owner-only: admin management and ownership transfer.
        assert_eq!(
            client.try_grant_admin(&admin, &outsider),
            Err(Ok(Error::NotOwner))
        );
        assert_eq!(
            client.try_transfer_owner(&admin, &outsider),
            Err(Ok(Error::NotOwner))
        );

        // Owner/admin only: pause and unpause.
        let pause_reason = SorobanString::from_str(&env, "maintenance");
        client.pause(&admin, &pause_reason);
        client.unpause(&owner, &pause_reason);

        // Operator cannot execute owner/admin-only actions.
        assert_eq!(
            client.try_pause(&operator, &pause_reason),
            Err(Ok(Error::NotAuthorized))
        );
        assert_eq!(
            client.try_grant_operator(&operator, &outsider),
            Err(Ok(Error::NotAuthorized))
        );
        assert_eq!(
            client.try_revoke_admin(&operator, &admin),
            Err(Ok(Error::NotOwner))
        );

        // Outsider cannot run privileged actions.
        assert_eq!(
            client.try_pause(&outsider, &pause_reason),
            Err(Ok(Error::NotAuthorized))
        );
    }

    #[test]
    fn operator_role_requires_admin_or_owner_assignment() {
        let (env, client) = new_client();
        let owner = Address::generate(&env);
        let outsider = Address::generate(&env);
        let operator = Address::generate(&env);

        client.initialize(&owner);

        assert_eq!(
            client.try_grant_operator(&outsider, &operator),
            Err(Ok(Error::NotAuthorized))
        );
        client.grant_operator(&owner, &operator);
        assert_eq!(
            client.try_grant_operator(&owner, &operator),
            Err(Ok(Error::AlreadyOperator))
        );
        client.revoke_operator(&owner, &operator);
        assert_eq!(
            client.try_revoke_operator(&owner, &operator),
            Err(Ok(Error::NotOperator))
        );
    }

    // ── Group J: Upgrade compatibility policy ───────────────────────────────

    #[test]
    fn upgrade_policy_is_discoverable() {
        let (_env, client) = new_client();
        let policy = client.get_upgrade_policy();

        assert_eq!(policy.policy_version, UPGRADE_POLICY_VERSION);
        assert_eq!(policy.current_major, CONTRACT_SEMVER_MAJOR);
        assert_eq!(policy.current_minor, CONTRACT_SEMVER_MINOR);
        assert_eq!(policy.current_patch, CONTRACT_SEMVER_PATCH);
        assert_eq!(policy.min_supported_from_major, MIN_SUPPORTED_FROM_MAJOR);
        assert_eq!(policy.min_supported_from_minor, MIN_SUPPORTED_FROM_MINOR);
        assert!(!policy.allow_major_upgrade);
    }

    #[test]
    fn version_transition_matrix_enforces_upgrade_constraints() {
        let (_env, client) = new_client();

        assert!(client.can_upgrade_from(&CONTRACT_SEMVER_MAJOR, &CONTRACT_SEMVER_MINOR, &0));
        assert!(client.can_upgrade_from(&CONTRACT_SEMVER_MAJOR, &MIN_SUPPORTED_FROM_MINOR, &0));
        assert!(!client.can_upgrade_from(&(CONTRACT_SEMVER_MAJOR + 1), &0, &0));
        assert!(!client.can_upgrade_from(&(CONTRACT_SEMVER_MAJOR - 1), &0, &0));
        assert!(!client.can_upgrade_from(&CONTRACT_SEMVER_MAJOR, &(CONTRACT_SEMVER_MINOR + 1), &0));
        assert!(!client.can_upgrade_from(
            &CONTRACT_SEMVER_MAJOR,
            &CONTRACT_SEMVER_MINOR,
            &(CONTRACT_SEMVER_PATCH + 1)
        ));
    }

    #[test]
    fn assert_upgrade_from_rejects_incompatible_versions() {
        let (_env, client) = new_client();

        assert_eq!(
            client.assert_upgrade_from(&CONTRACT_SEMVER_MAJOR, &CONTRACT_SEMVER_MINOR, &0),
            ()
        );
        assert_eq!(
            client.try_assert_upgrade_from(&(CONTRACT_SEMVER_MAJOR + 1), &0, &0),
            Err(Ok(Error::IncompatibleUpgrade))
        );
    }

    #[test]
    fn pause_blocks_anchor_and_unpause_restores_writes() {
        let (env, client) = new_client();
        let owner = Address::generate(&env);
        let reason = SorobanString::from_str(&env, "incident");
        let blocked_hash = sample_hash(&env, 91);
        let restored_hash = sample_hash(&env, 92);

        client.initialize(&owner);
        client.pause(&owner, &reason);
        assert!(client.is_paused());

        let paused_anchor = client.try_anchor_confession(&blocked_hash, &1_700_000_000_001);
        assert!(
            paused_anchor.is_err(),
            "anchoring should fail while paused: {paused_anchor:?}"
        );
        assert_eq!(client.verify_confession(&blocked_hash), None);
        assert_eq!(client.get_confession_count(), 0);

        client.unpause(&owner, &reason);
        assert!(!client.is_paused());
        assert_eq!(
            client.anchor_confession(&restored_hash, &1_700_000_000_002),
            symbol_short!("anchored")
        );
        assert_eq!(
            client.verify_confession(&restored_hash),
            Some(1_700_000_000_002)
        );
        assert_eq!(client.get_confession_count(), 1);
    }

    #[test]
    fn pause_reason_exact_limit_succeeds() {
        let (env, client) = new_client();
        let owner = Address::generate(&env);
        let reason = SorobanString::from_str(
            &env,
            &"r".repeat(emergency_pause::events::MAX_PAUSE_REASON_LEN as usize),
        );

        client.initialize(&owner);

        client.pause(&owner, &reason);
    }

    #[test]
    #[should_panic(expected = "pause reason too long")]
    fn pause_reason_limit_plus_one_rejected() {
        let (env, client) = new_client();
        let owner = Address::generate(&env);
        let reason = SorobanString::from_str(
            &env,
            &"r".repeat((emergency_pause::events::MAX_PAUSE_REASON_LEN + 1) as usize),
        );

        client.initialize(&owner);

        client.pause(&owner, &reason);
    }
}
