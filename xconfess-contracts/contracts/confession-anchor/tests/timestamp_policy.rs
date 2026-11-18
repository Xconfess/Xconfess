//! Timestamp policy tests for the confession-anchor contract (issue #2204).
//!
//! Policy under test:
//! - `timestamp` is a client-supplied claim. The contract stores it verbatim.
//!   It is not compared with ledger time, not required to be ordered, and not
//!   checked for units (seconds vs milliseconds).
//! - `anchor_height` is always the ledger sequence at anchor time. A client
//!   timestamp can never change it.
//! - `last_anchor_timestamp` reports the most recent successful write, not the
//!   maximum timestamp seen.
//! - Zero is a valid timestamp. `verify_confession` separates it from
//!   "not anchored" (`Some(0)` vs `None`).
//!
//! See `ConfessionAnchor::anchor_confession` for the same policy in rustdoc.

#![cfg(test)]

use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger, LedgerInfo},
    Address, BytesN, Env, IntoVal,
};

// ── helpers ───────────────────────────────────────────────────────────────────

fn new_client() -> (Env, ConfessionAnchorClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);
    (env, client)
}

/// Build a migrated (schema v2) client so `last_anchor_timestamp` is tracked.
fn migrated_client() -> (Env, ConfessionAnchorClient<'static>) {
    let (env, client) = new_client();
    let owner = Address::generate(&env);
    client.initialize(&owner);
    client.migrate(&owner);
    (env, client)
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn set_ledger(env: &Env, sequence: u32, timestamp: u64) {
    env.ledger().set(LedgerInfo {
        sequence_number: sequence,
        timestamp,
        ..env.ledger().get()
    });
}

/// Decode the single `confession_anchor` event emitted by the one anchor call
/// made in this environment. Payload layout:
/// `(event_version: u32, timestamp: u64, anchor_height: u32)`.
fn anchored_event_payload(env: &Env) -> (u32, u64, u32) {
    let events = env.events().all();
    assert_eq!(events.len(), 1, "exactly one anchor event expected");
    let (_contract_id, _topics, data) = events.first().unwrap();
    data.into_val(env)
}

// ── client timestamp vs ledger clock ──────────────────────────────────────────

/// The stored timestamp is whatever the client supplied. It is not checked
/// against the ledger clock in either direction, and anchoring does not move
/// the ledger clock.
#[test]
fn client_timestamp_is_stored_verbatim_regardless_of_ledger_time() {
    let (env, client) = new_client();
    set_ledger(&env, 10, 1_000_000);

    let far_past = hash(&env, 0x01);
    let far_future = hash(&env, 0x02);
    client.anchor_confession(&far_past, &1u64);
    client.anchor_confession(&far_future, &u64::MAX);

    assert_eq!(client.verify_confession(&far_past), Some(1));
    assert_eq!(client.verify_confession(&far_future), Some(u64::MAX));
    assert_eq!(
        env.ledger().timestamp(),
        1_000_000,
        "anchoring must not move the ledger clock"
    );
}

/// `anchor_height` is ledger metadata. Client timestamps at, below, and above
/// the ledger sequence, including `u64::MAX`, must not change it.
#[test]
fn anchor_height_comes_from_ledger_sequence_not_client_timestamp() {
    for client_ts in [0u64, 500, 9_999, u64::MAX] {
        let (env, client) = new_client();
        set_ledger(&env, 500, 42);

        client.anchor_confession(&hash(&env, 0x03), &client_ts);

        let (_version, stored_ts, anchor_height) = anchored_event_payload(&env);
        assert_eq!(stored_ts, client_ts, "event must echo the client timestamp");
        assert_eq!(
            anchor_height, 500,
            "anchor_height must be the ledger sequence for client_ts={client_ts}"
        );
    }
}

/// Units are not enforced. Second-scale and millisecond-scale values are both
/// accepted, so consumers must agree on units out of band.
#[test]
fn seconds_and_milliseconds_scales_are_both_accepted() {
    let (env, client) = new_client();
    set_ledger(&env, 1, 1_700_000_000);

    let seconds_hash = hash(&env, 0x04);
    let millis_hash = hash(&env, 0x05);
    assert_eq!(
        client.anchor_confession(&seconds_hash, &1_700_000_000u64),
        symbol_short!("anchored")
    );
    assert_eq!(
        client.anchor_confession(&millis_hash, &1_700_000_000_000u64),
        symbol_short!("anchored")
    );

    assert_eq!(client.verify_confession(&seconds_hash), Some(1_700_000_000));
    assert_eq!(
        client.verify_confession(&millis_hash),
        Some(1_700_000_000_000)
    );
}

// ── ordering and last-write semantics ─────────────────────────────────────────

/// Timestamps are not required to be monotonic. A later write with an earlier
/// timestamp is accepted, and `last_anchor_timestamp` reports that most recent
/// write rather than the maximum.
#[test]
fn out_of_order_timestamps_are_accepted_and_last_write_wins() {
    let (env, client) = migrated_client();

    let later_ts = hash(&env, 0x10);
    let earlier_ts = hash(&env, 0x11);
    client.anchor_confession(&later_ts, &3_000u64);
    client.anchor_confession(&earlier_ts, &1_000u64);

    assert_eq!(client.verify_confession(&later_ts), Some(3_000));
    assert_eq!(client.verify_confession(&earlier_ts), Some(1_000));
    assert_eq!(
        client.last_anchor_timestamp(),
        1_000,
        "last_anchor_timestamp must reflect the most recent write, not the maximum"
    );
    assert_eq!(client.get_confession_count(), 2);
}

// ── zero-value ambiguity ──────────────────────────────────────────────────────

/// Zero is a valid client timestamp. `verify_confession` distinguishes it from
/// "not anchored" (`Some(0)` vs `None`). `last_anchor_timestamp` cannot make
/// that distinction, so callers must use `verify_confession` as the existence
/// check.
#[test]
fn zero_timestamp_is_distinct_from_unanchored_only_via_verify() {
    let (env, client) = migrated_client();

    let anchored = hash(&env, 0x20);
    let missing = hash(&env, 0x21);
    assert_eq!(client.last_anchor_timestamp(), 0);

    client.anchor_confession(&anchored, &0u64);

    assert_eq!(client.verify_confession(&anchored), Some(0));
    assert_eq!(client.verify_confession(&missing), None);
    assert_eq!(
        client.last_anchor_timestamp(),
        0,
        "a zero timestamp is indistinguishable from the default in last_anchor_timestamp"
    );
}
