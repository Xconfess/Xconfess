//! Migration tests for the confession-anchor contract.
//!
//! Verifies the v1→v2 schema migration which introduces `LastAnchorTimestamp`.
//!
//! ## Fixture states
//! - **Fixture A** – freshly initialized, no owner, no anchors.
//! - **Fixture B** – owner set, 3 confessions anchored before migration.
//! - **Fixture C** – owner set, paused contract migrated.

#![cfg(test)]

extern crate std;

use confession_anchor::{
    ConfessionAnchor, ConfessionAnchorClient, Error, ANCHOR_SCHEMA_VERSION_CURRENT,
    ANCHOR_SCHEMA_VERSION_INITIAL,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    BytesN, Env, String as SorobanString,
};

// ── helpers ───────────────────────────────────────────────────────────────────

fn new_env() -> Env {
    let env = Env::default();
    env.mock_all_auths();
    env
}

fn new_client(env: &Env) -> ConfessionAnchorClient<'static> {
    let id = env.register(ConfessionAnchor, ());
    ConfessionAnchorClient::new(env, &id)
}

fn sample_hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn owner_client(env: &Env) -> (soroban_sdk::Address, ConfessionAnchorClient<'static>) {
    let client = new_client(env);
    let owner = soroban_sdk::Address::generate(env);
    client.initialize(&owner);
    (owner, client)
}

fn advance_ledger(env: &Env, delta: u32) {
    let current = env.ledger().sequence();
    env.ledger().set(LedgerInfo {
        sequence_number: current + delta,
        ..env.ledger().get()
    });
}

// ── schema version defaults ───────────────────────────────────────────────────

#[test]
fn schema_version_defaults_to_initial_before_migration() {
    let env = new_env();
    let client = new_client(&env);
    assert_eq!(
        client.schema_version(),
        ANCHOR_SCHEMA_VERSION_INITIAL,
        "schema version must default to ANCHOR_SCHEMA_VERSION_INITIAL before migrate()"
    );
}

#[test]
fn last_anchor_timestamp_defaults_to_zero_before_migration() {
    let env = new_env();
    let client = new_client(&env);
    assert_eq!(
        client.last_anchor_timestamp(),
        0u64,
        "last_anchor_timestamp must default to 0 before migrate()"
    );
}

// ── v1 → v2 migration correctness ─────────────────────────────────────────────

#[test]
fn migrate_bumps_schema_version_to_current() {
    let env = new_env();
    let (owner, client) = owner_client(&env);

    let new_version = client.migrate(&owner);
    assert_eq!(
        new_version, ANCHOR_SCHEMA_VERSION_CURRENT,
        "migrate() must return ANCHOR_SCHEMA_VERSION_CURRENT"
    );
    assert_eq!(
        client.schema_version(),
        ANCHOR_SCHEMA_VERSION_CURRENT,
        "schema_version() must reflect the upgraded version on-chain"
    );
}

#[test]
fn migrate_initialises_last_anchor_timestamp_to_zero() {
    let env = new_env();
    let (owner, client) = owner_client(&env);
    client.migrate(&owner);

    assert_eq!(
        client.last_anchor_timestamp(),
        0u64,
        "LastAnchorTimestamp must be initialised to 0 by migration (pre-existing anchors not backfilled)"
    );
}

// ── fixture B: pre-existing anchors survive migration ────────────────────────

/// All pre-migration anchors remain verifiable after the schema upgrade.
#[test]
fn migration_preserves_pre_existing_anchors() {
    let env = new_env();
    let (owner, client) = owner_client(&env);

    let entries: &[(u8, u64)] = &[(0xAA, 1_000), (0xBB, 2_000), (0xCC, 3_000)];
    for &(seed, ts) in entries {
        client.anchor_confession(&sample_hash(&env, seed), &ts);
    }
    assert_eq!(client.get_confession_count(), 3);

    client.migrate(&owner);

    for &(seed, ts) in entries {
        assert_eq!(
            client.verify_confession(&sample_hash(&env, seed)),
            Some(ts),
            "pre-migration anchor with seed {seed:#x} must survive migration"
        );
    }
    assert_eq!(
        client.get_confession_count(),
        3,
        "confession count must survive migration"
    );
}

/// Pre-migration anchors are NOT back-filled into LastAnchorTimestamp.
#[test]
fn last_anchor_timestamp_not_backfilled_for_pre_migration_anchors() {
    let env = new_env();
    let (owner, client) = owner_client(&env);

    client.anchor_confession(&sample_hash(&env, 0x01), &99_999u64);
    client.migrate(&owner);

    assert_eq!(
        client.last_anchor_timestamp(),
        0u64,
        "LastAnchorTimestamp must be 0 after migration — pre-migration anchors are not backfilled"
    );
}

// ── post-migration: LastAnchorTimestamp tracks correctly ──────────────────────

#[test]
fn last_anchor_timestamp_updated_by_post_migration_anchor() {
    let env = new_env();
    let (owner, client) = owner_client(&env);
    client.migrate(&owner);

    let ts: u64 = 5_000_000;
    client.anchor_confession(&sample_hash(&env, 0x10), &ts);

    assert_eq!(
        client.last_anchor_timestamp(),
        ts,
        "LastAnchorTimestamp must be updated after post-migration anchor"
    );
}

#[test]
fn last_anchor_timestamp_reflects_most_recent_anchor() {
    let env = new_env();
    let (owner, client) = owner_client(&env);
    client.migrate(&owner);

    client.anchor_confession(&sample_hash(&env, 0x20), &1_000u64);
    client.anchor_confession(&sample_hash(&env, 0x21), &2_000u64);
    client.anchor_confession(&sample_hash(&env, 0x22), &3_000u64);

    assert_eq!(
        client.last_anchor_timestamp(),
        3_000u64,
        "LastAnchorTimestamp must reflect the most recently anchored confession"
    );
}

#[test]
fn duplicate_anchor_does_not_update_last_anchor_timestamp() {
    let env = new_env();
    let (owner, client) = owner_client(&env);
    client.migrate(&owner);

    let hash = sample_hash(&env, 0x30);
    client.anchor_confession(&hash, &500u64);
    assert_eq!(client.last_anchor_timestamp(), 500u64);

    // Duplicate must not update the timestamp
    client.anchor_confession(&hash, &9_999u64);
    assert_eq!(
        client.last_anchor_timestamp(),
        500u64,
        "duplicate anchor must not update LastAnchorTimestamp"
    );
}

// ── fixture C: pause state preserved through migration ───────────────────────

#[test]
fn migration_preserves_pause_state() {
    let env = new_env();
    let (owner, client) = owner_client(&env);

    client.pause(&owner, &SorobanString::from_str(&env, "maintenance"));
    assert!(client.is_paused());

    // migrate() should succeed even while paused
    client.migrate(&owner);

    assert!(client.is_paused(), "paused flag must survive migration");
    assert_eq!(
        client.schema_version(),
        ANCHOR_SCHEMA_VERSION_CURRENT,
        "schema version must advance even while paused"
    );
}

// ── idempotency ───────────────────────────────────────────────────────────────

#[test]
fn migrate_is_idempotent() {
    let env = new_env();
    let (owner, client) = owner_client(&env);
    client.migrate(&owner);

    client.anchor_confession(&sample_hash(&env, 0x40), &7_777u64);
    let ts_after_first = client.last_anchor_timestamp();

    // Second migration must be a no-op
    let v2 = client.migrate(&owner);
    assert_eq!(v2, ANCHOR_SCHEMA_VERSION_CURRENT);
    assert_eq!(
        client.last_anchor_timestamp(),
        ts_after_first,
        "second migrate() must not reset LastAnchorTimestamp"
    );
    assert_eq!(
        client.get_confession_count(),
        1,
        "second migrate() must not alter confession count"
    );
}

#[test]
fn migrate_called_three_times_stays_at_current_version() {
    let env = new_env();
    let (owner, client) = owner_client(&env);
    for _ in 0..3 {
        assert_eq!(client.migrate(&owner), ANCHOR_SCHEMA_VERSION_CURRENT);
    }
}

// ── auth enforcement ──────────────────────────────────────────────────────────

#[test]
fn migrate_requires_owner_authorization() {
    let env = new_env();
    let (_, client) = owner_client(&env);
    let non_owner = soroban_sdk::Address::generate(&env);

    let result = client.try_migrate(&non_owner);
    assert_eq!(
        result,
        Err(Ok(Error::NotOwner)),
        "migrate() must reject non-owner callers"
    );
}

// ── rollback safety ───────────────────────────────────────────────────────────

/// Documents the rollback contract: migration only adds new keys; existing
/// keys are byte-identical before and after migration.
#[test]
fn v2_migration_does_not_modify_or_remove_v1_keys() {
    let env = new_env();
    let (owner, client) = owner_client(&env);

    // Capture v1 state
    client.anchor_confession(&sample_hash(&env, 0x50), &12_345u64);
    let pre_count = client.get_confession_count();
    let pre_verify = client.verify_confession(&sample_hash(&env, 0x50));
    let pre_version = client.get_version();

    client.migrate(&owner);

    // v1 keys must be byte-for-byte identical after migration
    assert_eq!(client.get_confession_count(), pre_count);
    assert_eq!(
        client.verify_confession(&sample_hash(&env, 0x50)),
        pre_verify
    );
    let post_version = client.get_version();
    assert_eq!(post_version.major, pre_version.major);
    assert_eq!(post_version.minor, pre_version.minor);
    assert_eq!(post_version.patch, pre_version.patch);
}

/// Verifies that the upgrade policy constants are unaffected by the migration.
#[test]
fn upgrade_policy_unchanged_after_migration() {
    let env = new_env();
    let (owner, client) = owner_client(&env);
    let policy_before = client.get_upgrade_policy();

    client.migrate(&owner);

    let policy_after = client.get_upgrade_policy();
    assert_eq!(policy_before.current_major, policy_after.current_major);
    assert_eq!(policy_before.policy_version, policy_after.policy_version);
}

// ── ledger advance interaction ────────────────────────────────────────────────

/// LastAnchorTimestamp uses the client-provided timestamp, not ledger time.
/// It must update even across ledger sequence advances.
#[test]
fn last_anchor_timestamp_uses_client_timestamp_not_ledger_time() {
    let env = new_env();
    let (owner, client) = owner_client(&env);
    client.migrate(&owner);

    advance_ledger(&env, 100);
    let client_ts: u64 = 9_876_543_210;
    client.anchor_confession(&sample_hash(&env, 0x60), &client_ts);

    assert_eq!(
        client.last_anchor_timestamp(),
        client_ts,
        "LastAnchorTimestamp must equal the client-supplied timestamp"
    );
}
