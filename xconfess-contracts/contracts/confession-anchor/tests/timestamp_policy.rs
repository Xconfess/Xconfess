//! Boundary and migration tests for the confession-anchor timestamp policy.
//!
//! Policy (see `ANCHOR_TIMESTAMP_POLICY_MIN` in the contract):
//!   * new anchor timestamps must be non-decreasing (equal is allowed);
//!   * validation is only active after schema-v2 `migrate()`;
//!   * an invalid timestamp must not mutate state or emit an event.

#![cfg(test)]

extern crate std;

use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use soroban_sdk::{testutils::Address as _, testutils::Events, BytesN, Env};

/// `anchor_confession` returns a Symbol, so policy failures surface as a
/// typed contract error. Assert the stable numeric code (`16`).
fn assert_stable_error<T, C, I>(
    result: Result<Result<T, C>, Result<soroban_sdk::Error, I>>,
    code: u32,
) where
    T: std::fmt::Debug,
    C: std::fmt::Debug,
    I: std::fmt::Debug,
{
    match result {
        Err(Ok(e)) => assert_eq!(e.get_code(), code, "unexpected stable error code"),
        other => panic!("expected contract error {code}, got {other:?}"),
    }
}

fn client_with_owner(env: &Env) -> (soroban_sdk::Address, ConfessionAnchorClient<'static>) {
    env.mock_all_auths();
    let id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(env, &id);
    let owner = soroban_sdk::Address::generate(env);
    client.initialize(&owner);
    (owner, client)
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

// ── pre-migration compatibility ──────────────────────────────────────────────

#[test]
fn policy_inactive_before_migration() {
    let env = Env::default();
    let (_owner, client) = client_with_owner(&env);

    // Backwards timestamps are accepted while the v2 key is absent.
    assert_eq!(
        client.anchor_confession(&hash(&env, 1), &50_000),
        soroban_sdk::symbol_short!("anchored")
    );
    assert_eq!(
        client.anchor_confession(&hash(&env, 2), &100),
        soroban_sdk::symbol_short!("anchored")
    );

    assert_eq!(client.verify_confession(&hash(&env, 1)), Some(50_000));
    assert_eq!(client.verify_confession(&hash(&env, 2)), Some(100));
    // Policy inactive: even "backwards" values are accepted.
    assert!(client.can_anchor_with_timestamp(&0));
}

// ── post-migration monotonicity ──────────────────────────────────────────────

#[test]
fn migrated_contract_rejects_backwards_timestamp_without_mutation() {
    let env = Env::default();
    let (owner, client) = client_with_owner(&env);
    client.migrate(&owner);

    assert_eq!(
        client.anchor_confession(&hash(&env, 1), &1_000),
        soroban_sdk::symbol_short!("anchored")
    );

    let rejected = client.try_anchor_confession(&hash(&env, 2), &999);
    assert_stable_error(rejected, 16);

    // No state mutation and no event for the rejected call.
    assert_eq!(client.verify_confession(&hash(&env, 2)), None);
    assert_eq!(client.get_confession_count(), 1);
    assert_eq!(client.last_anchor_timestamp(), 1_000);
    // The rejected invocation emitted no events of its own.
    assert_eq!(env.events().all().len(), 0);
}

#[test]
fn migrated_contract_allows_equal_and_forward_timestamps() {
    let env = Env::default();
    let (owner, client) = client_with_owner(&env);
    client.migrate(&owner);

    client.anchor_confession(&hash(&env, 1), &1_000);
    // Equal timestamp is explicitly allowed (non-decreasing policy).
    client.anchor_confession(&hash(&env, 2), &1_000);
    assert_eq!(client.last_anchor_timestamp(), 1_000);

    // Forward timestamp advances the watermark.
    client.anchor_confession(&hash(&env, 3), &1_001);
    assert_eq!(client.last_anchor_timestamp(), 1_001);
    assert_eq!(client.get_confession_count(), 3);
}

#[test]
fn zero_and_u64_max_boundaries_after_migration() {
    let env = Env::default();
    let (owner, client) = client_with_owner(&env);
    client.migrate(&owner);

    assert_eq!(
        client.anchor_confession(&hash(&env, 1), &0),
        soroban_sdk::symbol_short!("anchored")
    );
    assert_eq!(
        client.anchor_confession(&hash(&env, 2), &u64::MAX),
        soroban_sdk::symbol_short!("anchored")
    );
    assert_eq!(client.last_anchor_timestamp(), u64::MAX);
    assert_stable_error(
        client.try_anchor_confession(&hash(&env, 3), &(u64::MAX - 1)),
        16,
    );
    // Equal to the maximum is allowed.
    client.anchor_confession(&hash(&env, 4), &u64::MAX);
}

// ── migration interaction ────────────────────────────────────────────────────

#[test]
fn historical_anchors_are_not_backfilled_and_remain_valid() {
    let env = Env::default();
    let (owner, client) = client_with_owner(&env);

    client.anchor_confession(&hash(&env, 1), &99_999);
    client.migrate(&owner);

    assert_eq!(client.verify_confession(&hash(&env, 1)), Some(99_999));
    assert_eq!(client.last_anchor_timestamp(), 0);

    // A low timestamp is accepted after migration because the watermark was
    // intentionally not back-filled from pre-migration anchors.
    client.anchor_confession(&hash(&env, 2), &1);
    assert_eq!(client.last_anchor_timestamp(), 1);
    assert_stable_error(client.try_anchor_confession(&hash(&env, 3), &0), 16);
}

#[test]
fn policy_predicate_tracks_migration_state() {
    let env = Env::default();
    let (owner, client) = client_with_owner(&env);

    client.anchor_confession(&hash(&env, 1), &5_000);
    assert!(client.can_anchor_with_timestamp(&1_000)); // policy inactive

    client.migrate(&owner);
    // Pre-migration anchors are not back-filled, so the watermark is still 0.
    assert!(client.can_anchor_with_timestamp(&1_000));

    client.anchor_confession(&hash(&env, 2), &2_000);
    assert!(client.can_anchor_with_timestamp(&2_000)); // equal is allowed
    assert!(!client.can_anchor_with_timestamp(&1_999)); // now backwards
}
