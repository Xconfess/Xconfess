//! Integration tests — ConfessionAnchor local sandbox
//!
//! These tests exercise the full public surface of the contract in a local
//! Soroban environment, including initialization, admin lifecycle, anchoring,
//! pause/unpause, schema migration, and cross-method invariants.
//!
//! Run with:
//!   cargo test --test integration -p confession-anchor -- --nocapture

#![cfg(test)]

use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient, Error};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, BytesN, Env, String as SorobanString,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

fn setup() -> (Env, ConfessionAnchorClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    client.initialize(&owner);
    (env, client, owner)
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn reason(env: &Env, text: &str) -> SorobanString {
    SorobanString::from_str(env, text)
}

fn advance(env: &Env, delta: u32) {
    let seq = env.ledger().sequence();
    env.ledger().set(LedgerInfo {
        sequence_number: seq + delta,
        ..env.ledger().get()
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — Initialization
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn owner_is_set_after_initialize() {
    let (env, client, owner) = setup();
    assert_eq!(
        client.get_owner(),
        Ok(owner),
        "owner must match the address passed to initialize"
    );
}

#[test]
fn confession_count_is_zero_on_fresh_contract() {
    let (_env, client, _owner) = setup();
    assert_eq!(client.get_confession_count(), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — Anchor lifecycle
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn anchor_and_verify_round_trip() {
    let (env, client, _owner) = setup();
    let h = hash(&env, 1);
    let ts: u64 = 1_700_000_000_000;

    let status = client.anchor_confession(&h, &ts);
    assert_eq!(status, soroban_sdk::symbol_short!("anchored"));

    assert_eq!(client.verify_confession(&h), Some(ts));
    assert_eq!(client.get_confession_count(), 1);
}

#[test]
fn duplicate_anchor_is_idempotent() {
    let (env, client, _owner) = setup();
    let h = hash(&env, 2);

    client.anchor_confession(&h, &1_000);
    let status = client.anchor_confession(&h, &9_999);

    assert_eq!(status, soroban_sdk::symbol_short!("exists"));
    assert_eq!(client.verify_confession(&h), Some(1_000));
    assert_eq!(client.get_confession_count(), 1);
}

#[test]
fn verify_unknown_hash_returns_none() {
    let (env, client, _owner) = setup();
    assert_eq!(client.verify_confession(&hash(&env, 99)), None);
}

#[test]
fn count_increments_only_for_unique_hashes() {
    let (env, client, _owner) = setup();
    let h1 = hash(&env, 10);
    let h2 = hash(&env, 11);

    client.anchor_confession(&h1, &1_000);
    client.anchor_confession(&h1, &2_000); // duplicate
    client.anchor_confession(&h2, &3_000);

    assert_eq!(client.get_confession_count(), 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — Anchor height and ledger sequence
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn two_anchors_at_different_ledger_heights_both_verifiable() {
    let (env, client, _owner) = setup();

    env.ledger().set(LedgerInfo {
        sequence_number: 50,
        ..env.ledger().get()
    });
    client.anchor_confession(&hash(&env, 20), &1_000);

    advance(&env, 100);
    client.anchor_confession(&hash(&env, 21), &2_000);

    assert_eq!(client.verify_confession(&hash(&env, 20)), Some(1_000));
    assert_eq!(client.verify_confession(&hash(&env, 21)), Some(2_000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — Pause / unpause
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn paused_contract_blocks_anchor() {
    let (env, client, owner) = setup();
    client.pause(&owner, &reason(&env, "maintenance"));
    assert!(client.is_paused());

    let result = client.try_anchor_confession(&hash(&env, 30), &1_000);
    assert!(result.is_err(), "anchor must fail while contract is paused");
    assert_eq!(client.get_confession_count(), 0);
}

#[test]
fn unpause_restores_anchor_writes() {
    let (env, client, owner) = setup();
    let r = reason(&env, "incident");

    client.pause(&owner, &r);
    client.unpause(&owner, &r);
    assert!(!client.is_paused());

    let h = hash(&env, 31);
    assert_eq!(
        client.anchor_confession(&h, &1_000),
        soroban_sdk::symbol_short!("anchored")
    );
    assert_eq!(client.get_confession_count(), 1);
}

#[test]
fn double_pause_is_rejected() {
    let (env, client, owner) = setup();
    let r = reason(&env, "bug");

    client.pause(&owner, &r);
    let result = client.try_pause(&owner, &r);
    assert_eq!(result, Err(Ok(Error::AlreadyPaused)));
}

#[test]
fn unpause_without_prior_pause_is_rejected() {
    let (env, client, owner) = setup();
    let result = client.try_unpause(&owner, &reason(&env, "oops"));
    assert_eq!(result, Err(Ok(Error::NotPaused)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — Admin management
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn owner_can_grant_and_revoke_admin() {
    let (env, client, owner) = setup();
    let admin = Address::generate(&env);

    client.grant_admin(&owner, &admin);
    assert!(client.is_admin(&admin));
    assert_eq!(client.get_admin_count(), 1);

    client.revoke_admin(&owner, &admin);
    assert!(!client.is_admin(&admin));
    assert_eq!(client.get_admin_count(), 0);
}

#[test]
fn admin_can_pause_but_not_grant_admin() {
    let (env, client, owner) = setup();
    let admin = Address::generate(&env);
    let outsider = Address::generate(&env);

    client.grant_admin(&owner, &admin);
    client.pause(&admin, &reason(&env, "admin-pause"));
    assert!(client.is_paused());

    let result = client.try_grant_admin(&admin, &outsider);
    assert_eq!(result, Err(Ok(Error::NotOwner)));
}

#[test]
fn operator_cannot_pause() {
    let (env, client, owner) = setup();
    let operator = Address::generate(&env);

    client.grant_operator(&owner, &operator);
    let result = client.try_pause(&operator, &reason(&env, "op-pause"));
    assert_eq!(result, Err(Ok(Error::NotAuthorized)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — Schema migration (v1 → v2)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn migrate_advances_schema_version_to_2() {
    let (env, client, owner) = setup();
    let version = client.migrate(&owner).unwrap();
    assert_eq!(version, 2, "migrate() must return the new schema version");
    assert_eq!(client.schema_version(), 2);
}

#[test]
fn migrate_is_idempotent() {
    let (env, client, owner) = setup();
    client.migrate(&owner).unwrap();
    let version = client.migrate(&owner).unwrap();
    assert_eq!(
        version, 2,
        "second migrate() call must be a no-op returning current version"
    );
}

#[test]
fn last_anchor_timestamp_updates_after_migration() {
    let (env, client, owner) = setup();
    client.migrate(&owner).unwrap();

    let h = hash(&env, 40);
    let ts: u64 = 9_999_999;
    client.anchor_confession(&h, &ts);

    assert_eq!(client.last_anchor_timestamp(), ts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 — Upgrade compatibility policy
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn can_upgrade_from_same_version() {
    let (_env, client, _owner) = setup();
    assert!(client.can_upgrade_from(&1, &0, &0));
}

#[test]
fn cannot_upgrade_from_higher_minor() {
    let (_env, client, _owner) = setup();
    assert!(!client.can_upgrade_from(&1, &99, &0));
}

#[test]
fn cannot_upgrade_from_different_major() {
    let (_env, client, _owner) = setup();
    assert!(!client.can_upgrade_from(&2, &0, &0));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8 — Cross-method invariants
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn anchor_count_never_decreases() {
    let (env, client, _owner) = setup();

    for i in 0u8..20 {
        client.anchor_confession(&hash(&env, i), &(i as u64 * 1_000));
        let count = client.get_confession_count();
        assert!(count > 0, "count must never be 0 after at least one anchor");
    }
    assert_eq!(client.get_confession_count(), 20);
}

#[test]
fn pause_does_not_affect_verify_or_count() {
    let (env, client, owner) = setup();

    let h = hash(&env, 50);
    client.anchor_confession(&h, &1_000);

    client.pause(&owner, &reason(&env, "audit"));

    // Read-only operations must still work while paused
    assert_eq!(client.verify_confession(&h), Some(1_000));
    assert_eq!(client.get_confession_count(), 1);
}
