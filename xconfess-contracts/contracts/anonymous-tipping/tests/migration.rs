//! Migration tests for the anonymous-tipping contract.
//!
//! Each test exercises a specific aspect of the v1→v2 schema migration:
//!   - fresh contract (never init'd), already-migrated contracts, idempotency,
//!     fixture states with live data, rollback properties, and auth enforcement.
//!
//! ## Fixture states used
//! - **Fixture A** – fresh contract, `init()` called, no tips, no owner.
//! - **Fixture B** – contract with 3 tips sent to 2 recipients before migration.
//! - **Fixture C** – contract with owner + pause state, then migrated.

extern crate std;

use anonymous_tipping::{
    AnonymousTipping, AnonymousTippingClient, SCHEMA_VERSION_CURRENT, SCHEMA_VERSION_INITIAL,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String as SorobanString};

// ── helpers ───────────────────────────────────────────────────────────────────

fn setup() -> (Env, Address, AnonymousTippingClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &id);
    client.init(&id);
    (env, id, client)
}

fn owner_setup() -> (Env, Address, Address, AnonymousTippingClient<'static>) {
    let (env, id, client) = setup();
    let owner = Address::generate(&env);
    client.configure_controls(&owner, &1_000u32, &60u64);
    (env, id, owner, client)
}

// ── schema version defaults ───────────────────────────────────────────────────

#[test]
fn schema_version_is_initial_before_migration() {
    let (_env, _id, client) = setup();
    assert_eq!(
        client.schema_version(),
        SCHEMA_VERSION_INITIAL,
        "schema version must default to SCHEMA_VERSION_INITIAL before migrate() is called"
    );
}

#[test]
fn global_tip_count_is_zero_before_migration() {
    let (_env, _id, client) = setup();
    assert_eq!(
        client.global_tip_count(),
        0,
        "global_tip_count must default to 0 before migration"
    );
}

// ── v1 → v2 migration correctness ─────────────────────────────────────────────

#[test]
fn migrate_bumps_schema_version_to_current() {
    let (_env, _id, owner, client) = owner_setup();

    let new_version = client.migrate(&owner);
    assert_eq!(
        new_version, SCHEMA_VERSION_CURRENT,
        "migrate() must return SCHEMA_VERSION_CURRENT after upgrade"
    );
    assert_eq!(
        client.schema_version(),
        SCHEMA_VERSION_CURRENT,
        "schema_version() must reflect the upgraded version"
    );
}

#[test]
fn migrate_initialises_global_tip_count_to_zero() {
    let (_env, _id, owner, client) = owner_setup();
    client.migrate(&owner);

    assert_eq!(
        client.global_tip_count(),
        0,
        "GlobalTipCount must be initialised to 0 by migration"
    );
}

// ── fixture B: tips exist before migration ────────────────────────────────────

/// Pre-migration tips must remain unaffected: the existing recipient totals
/// and settlement nonce are preserved after the schema upgrade.
#[test]
fn migration_preserves_pre_existing_recipient_totals() {
    let (env, _id, owner, client) = owner_setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    // Send tips before migration (fixture B state)
    let id1 = client.send_tip(&Address::generate(&env), &alice, &100i128);
    let id2 = client.send_tip(&Address::generate(&env), &alice, &50i128);
    let id3 = client.send_tip(&Address::generate(&env), &bob, &200i128);
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(id3, 3);

    client.migrate(&owner);

    assert_eq!(
        client.get_tips(&alice),
        150i128,
        "alice's total must survive migration"
    );
    assert_eq!(
        client.get_tips(&bob),
        200i128,
        "bob's total must survive migration"
    );
    assert_eq!(
        client.latest_settlement_nonce(),
        3,
        "settlement nonce must survive migration"
    );
}

/// Pre-migration tips are NOT counted in GlobalTipCount; the counter starts
/// at 0 after migration.  Post-migration tips do increment the counter.
#[test]
fn global_tip_count_starts_at_zero_post_migration_not_backfilled() {
    let (env, _id, owner, client) = owner_setup();
    let alice = Address::generate(&env);

    // 3 tips before migration
    client.send_tip(&Address::generate(&env), &alice, &10i128);
    client.send_tip(&Address::generate(&env), &alice, &10i128);
    client.send_tip(&Address::generate(&env), &alice, &10i128);

    client.migrate(&owner);

    assert_eq!(
        client.global_tip_count(),
        0,
        "GlobalTipCount must start at 0 after migration — pre-migration tips are not backfilled"
    );

    // 2 tips after migration
    client.send_tip(&Address::generate(&env), &alice, &5i128);
    client.send_tip(&Address::generate(&env), &alice, &5i128);

    assert_eq!(
        client.global_tip_count(),
        2,
        "only post-migration tips must increment GlobalTipCount"
    );
}

// ── post-migration: GlobalTipCount increments correctly ───────────────────────

#[test]
fn global_tip_count_increments_by_one_per_successful_tip() {
    let (env, _id, owner, client) = owner_setup();
    client.migrate(&owner);

    let recipient = Address::generate(&env);
    for expected in 1u64..=5 {
        client.send_tip(&Address::generate(&env), &recipient, &1i128);
        assert_eq!(
            client.global_tip_count(),
            expected,
            "GlobalTipCount must be {} after {} tips",
            expected,
            expected
        );
    }
}

#[test]
fn global_tip_count_spans_multiple_recipients() {
    let (env, _id, owner, client) = owner_setup();
    client.migrate(&owner);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.send_tip(&Address::generate(&env), &alice, &1i128);
    client.send_tip(&Address::generate(&env), &bob, &1i128);
    client.send_tip(&Address::generate(&env), &alice, &1i128);

    assert_eq!(client.global_tip_count(), 3);
}

#[test]
fn global_tip_count_not_incremented_by_failed_tip() {
    let (env, _id, owner, client) = owner_setup();
    client.migrate(&owner);

    let recipient = Address::generate(&env);

    // Failed tip (invalid amount) must not increment counter
    let _ = client.try_send_tip(&Address::generate(&env), &recipient, &0i128);
    assert_eq!(
        client.global_tip_count(),
        0,
        "failed tip must not increment GlobalTipCount"
    );

    // Successful tip increments
    client.send_tip(&Address::generate(&env), &recipient, &1i128);
    assert_eq!(client.global_tip_count(), 1);
}

// ── fixture C: pause state preserved through migration ───────────────────────

#[test]
fn migration_preserves_pause_state() {
    let (env, _id, owner, client) = owner_setup();
    let reason = SorobanString::from_str(&env, "scheduled-maintenance");
    client.pause(&owner, &reason);
    assert!(client.is_paused());

    client.migrate(&owner);

    assert!(
        client.is_paused(),
        "paused flag must be preserved through migration"
    );
    assert_eq!(
        client.schema_version(),
        SCHEMA_VERSION_CURRENT,
        "schema version must advance even when contract is paused"
    );
}

#[test]
fn migration_preserves_rate_limit_config() {
    let (_env, _id, owner, client) = owner_setup();
    // Custom rate-limit (overrides the default set by configure_controls)
    client.configure_controls(&owner, &25u32, &300u64);
    client.migrate(&owner);

    let cfg = client.get_rate_limit_config();
    assert_eq!(
        cfg.max_tips_per_window, 25,
        "max_tips_per_window must survive migration"
    );
    assert_eq!(
        cfg.window_seconds, 300,
        "window_seconds must survive migration"
    );
}

// ── idempotency ───────────────────────────────────────────────────────────────

#[test]
fn migrate_is_idempotent() {
    let (env, _id, owner, client) = owner_setup();
    client.migrate(&owner);

    // Accumulate some state after first migration
    let recipient = Address::generate(&env);
    client.send_tip(&Address::generate(&env), &recipient, &77i128);
    let count_after_first = client.global_tip_count();
    assert_eq!(count_after_first, 1);

    // Second migrate must be a no-op
    let version_again = client.migrate(&owner);
    assert_eq!(version_again, SCHEMA_VERSION_CURRENT);
    assert_eq!(
        client.global_tip_count(),
        1,
        "second migrate() must not reset GlobalTipCount"
    );
    assert_eq!(
        client.get_tips(&recipient),
        77i128,
        "second migrate() must not alter recipient totals"
    );
}

#[test]
fn migrate_multiple_times_returns_current_version_each_time() {
    let (_env, _id, owner, client) = owner_setup();
    for _ in 0..3 {
        let v = client.migrate(&owner);
        assert_eq!(v, SCHEMA_VERSION_CURRENT);
    }
    assert_eq!(client.schema_version(), SCHEMA_VERSION_CURRENT);
}

// ── auth enforcement ──────────────────────────────────────────────────────────

#[test]
fn migrate_requires_owner_authorization() {
    use anonymous_tipping::Error;
    let (env, _id, _owner, client) = owner_setup();
    let non_owner = Address::generate(&env);

    let result = client.try_migrate(&non_owner);
    assert_eq!(
        result,
        Err(Ok(Error::Unauthorized)),
        "migrate() must reject non-owner callers"
    );
}

// ── rollback safety ───────────────────────────────────────────────────────────

/// Documents the rollback contract: a v1 deployment can read v2-migrated
/// storage without corruption because migration only ADDS new keys.
/// This test simulates the v1 perspective by verifying the pre-existing keys
/// are unchanged after v2 migration.
#[test]
fn v2_migration_does_not_modify_or_remove_v1_keys() {
    let (env, _id, owner, client) = owner_setup();
    let alice = Address::generate(&env);

    // Capture v1 state
    client.send_tip(&Address::generate(&env), &alice, &500i128);
    let pre_nonce = client.latest_settlement_nonce();
    let pre_total = client.get_tips(&alice);
    let pre_rate_cfg = client.get_rate_limit_config();

    client.migrate(&owner);

    // v1 keys must be byte-for-byte identical after migration
    assert_eq!(client.latest_settlement_nonce(), pre_nonce);
    assert_eq!(client.get_tips(&alice), pre_total);
    let post_cfg = client.get_rate_limit_config();
    assert_eq!(
        post_cfg.max_tips_per_window,
        pre_rate_cfg.max_tips_per_window
    );
    assert_eq!(post_cfg.window_seconds, pre_rate_cfg.window_seconds);
}
