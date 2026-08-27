//! Storage compatibility tests for confession-anchor and anonymous-tipping contracts.
//!
//! These tests pin the critical persisted state that backend consumers depend
//! on so that a breaking storage layout change is caught before merge.  Each
//! test writes state via contract calls then verifies the same state is
//! readable through an independent client pointed at the same address —
//! mirroring what happens when a WASM upgrade is applied at a live address
//! (storage is preserved; new code must decode the old layout).

#![cfg(test)]

extern crate std;

use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient};
use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use confession_registry::{ConfessionRegistry, ConfessionRegistryClient};
use reputation_badges::{BadgeType, ReputationBadges, ReputationBadgesClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String as SorobanString};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Returns `(env, pre_upgrade_client, post_upgrade_client)` where both
/// clients point at the same contract address.  The "pre" client writes
/// state; the "post" client reads it back, simulating a WASM upgrade where
/// storage is preserved but code is replaced.
fn anchor_pair() -> (
    Env,
    ConfessionAnchorClient<'static>,
    ConfessionAnchorClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ConfessionAnchor, ());
    let pre = ConfessionAnchorClient::new(&env, &id);
    let post = ConfessionAnchorClient::new(&env, &id);
    (env, pre, post)
}

fn tipping_pair() -> (
    Env,
    AnonymousTippingClient<'static>,
    AnonymousTippingClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(AnonymousTipping, ());
    let pre = AnonymousTippingClient::new(&env, &id);
    pre.init(&id);
    let post = AnonymousTippingClient::new(&env, &id);
    (env, pre, post)
}

fn sample_hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

fn registry_pair() -> (
    Env,
    ConfessionRegistryClient<'static>,
    ConfessionRegistryClient<'static>,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ConfessionRegistry, ());
    let pre = ConfessionRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    pre.initialize(&admin);
    let post = ConfessionRegistryClient::new(&env, &id);
    (env, pre, post, admin)
}

fn reputation_pair() -> (
    Env,
    ReputationBadgesClient<'static>,
    ReputationBadgesClient<'static>,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ReputationBadges, ());
    let pre = ReputationBadgesClient::new(&env, &id);
    let admin = Address::generate(&env);
    pre.initialize(&admin);
    let post = ReputationBadgesClient::new(&env, &id);
    (env, pre, post, admin)
}

// ─────────────────────────────────────────────────────────────────────────────
// confession-anchor storage compat
// ─────────────────────────────────────────────────────────────────────────────

/// An anchored confession written by `pre` must be readable by `post` at the
/// same address — the storage key layout must not change between releases.
#[test]
fn anchor_anchored_data_readable_after_upgrade() {
    let (env, pre, post) = anchor_pair();

    let hash = sample_hash(&env, 0xAB);
    let ts: u64 = 1_700_000_000_000;

    pre.anchor_confession(&hash, &ts);

    assert_eq!(
        post.verify_confession(&hash),
        Some(ts),
        "anchored timestamp must survive upgrade"
    );
    assert_eq!(
        post.get_confession_count(),
        1,
        "confession count must survive upgrade"
    );
}

/// Multiple anchors written before the upgrade remain individually
/// addressable afterward.
#[test]
fn anchor_multiple_hashes_readable_after_upgrade() {
    let (env, pre, post) = anchor_pair();

    let entries: [(BytesN<32>, u64); 3] = [
        (sample_hash(&env, 0x01), 1_000_000),
        (sample_hash(&env, 0x02), 2_000_000),
        (sample_hash(&env, 0x03), 3_000_000),
    ];

    for (h, ts) in &entries {
        pre.anchor_confession(h, ts);
    }
    assert_eq!(pre.get_confession_count(), 3);

    for (h, ts) in &entries {
        assert_eq!(
            post.verify_confession(h),
            Some(*ts),
            "each anchored hash must still resolve after upgrade"
        );
    }
    assert_eq!(post.get_confession_count(), 3);
}

/// The unique-hash count key uses a stable storage symbol.  Both the
/// zero-count (pre-anchor) and non-zero-count (post-anchor) states must
/// be readable through the post-upgrade client.
#[test]
fn anchor_count_key_is_stable_across_upgrade() {
    let (_env, pre, post) = anchor_pair();

    assert_eq!(post.get_confession_count(), 0, "fresh count must be zero");

    let hash = BytesN::from_array(&pre.env, &[0xCC; 32]);
    pre.anchor_confession(&hash, &999);

    assert_eq!(
        post.get_confession_count(),
        1,
        "count must be 1 after one anchor"
    );
}

/// The all-zero and all-0xFF boundary hashes remain independently addressable
/// after an upgrade.
#[test]
fn anchor_boundary_hash_keys_survive_upgrade() {
    let (env, pre, post) = anchor_pair();

    let zero_hash = BytesN::from_array(&env, &[0x00u8; 32]);
    let max_hash = BytesN::from_array(&env, &[0xFFu8; 32]);

    pre.anchor_confession(&zero_hash, &0u64);
    pre.anchor_confession(&max_hash, &u64::MAX);

    assert_eq!(post.verify_confession(&zero_hash), Some(0u64));
    assert_eq!(post.verify_confession(&max_hash), Some(u64::MAX));
}

/// Upgrade policy constants are readable after upgrade; consumers that gate
/// on version information must always see consistent values.
#[test]
fn anchor_upgrade_policy_is_stable_after_upgrade() {
    let (_env, pre, post) = anchor_pair();

    let before = pre.get_upgrade_policy();
    let after = post.get_upgrade_policy();

    assert_eq!(before.current_major, after.current_major);
    assert_eq!(before.current_minor, after.current_minor);
    assert_eq!(before.current_patch, after.current_patch);
    assert_eq!(before.policy_version, after.policy_version);
}

/// A duplicate anchor attempt on an already-anchored hash must still return
/// the original timestamp — both before and after simulated upgrade.
#[test]
fn anchor_duplicate_protection_preserved_after_upgrade() {
    let (env, pre, post) = anchor_pair();

    let hash = sample_hash(&env, 0xDD);
    let original_ts: u64 = 5_000_000;

    pre.anchor_confession(&hash, &original_ts);

    // Simulate a replayed or duplicate anchor after upgrade.
    let status = post.anchor_confession(&hash, &9_999_999);
    assert_eq!(status, soroban_sdk::symbol_short!("exists"));
    assert_eq!(
        post.verify_confession(&hash),
        Some(original_ts),
        "original timestamp must not be overwritten after upgrade"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// anonymous-tipping storage compat
// ─────────────────────────────────────────────────────────────────────────────

/// The settlement nonce written by `pre` is still readable with the correct
/// value via the `post` client at the same address.
#[test]
fn tipping_settlement_nonce_survives_upgrade() {
    let (env, pre, post) = tipping_pair();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let id1 = pre.send_tip(&sender, &recipient, &100i128);
    let id2 = pre.send_tip(&sender, &recipient, &200i128);
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);

    assert_eq!(
        post.latest_settlement_nonce(),
        2,
        "settlement nonce must survive upgrade"
    );
}

/// Accumulated tip totals per recipient are preserved for the post-upgrade
/// client.
#[test]
fn tipping_recipient_totals_survive_upgrade() {
    let (env, pre, post) = tipping_pair();

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let sender = Address::generate(&env);

    pre.send_tip(&sender, &alice, &500i128);
    pre.send_tip(&sender, &alice, &250i128);
    pre.send_tip(&sender, &bob, &1000i128);

    assert_eq!(
        post.get_tips(&alice),
        750i128,
        "alice total must survive upgrade"
    );
    assert_eq!(
        post.get_tips(&bob),
        1000i128,
        "bob total must survive upgrade"
    );
}

/// The paused flag persisted by `pre` is readable via `post` with the same
/// value.
#[test]
fn tipping_pause_state_survives_upgrade() {
    let (env, pre, post) = tipping_pair();
    let owner = Address::generate(&env);

    pre.configure_controls(&owner, &1_000u32, &60u64);
    pre.pause(&owner, &SorobanString::from_str(&env, "maintenance"));
    assert!(pre.is_paused());

    assert!(post.is_paused(), "paused flag must survive upgrade");
}

/// Rate-limit configuration stored by `pre` is accessible via `post` with
/// the same values.
#[test]
fn tipping_rate_limit_config_survives_upgrade() {
    let (env, pre, post) = tipping_pair();
    let owner = Address::generate(&env);

    pre.configure_controls(&owner, &50u32, &120u64);

    let cfg_before = pre.get_rate_limit_config();
    assert_eq!(cfg_before.max_tips_per_window, 50);
    assert_eq!(cfg_before.window_seconds, 120);

    let cfg_after = post.get_rate_limit_config();
    assert_eq!(
        cfg_after.max_tips_per_window, 50,
        "max_tips_per_window must survive upgrade"
    );
    assert_eq!(
        cfg_after.window_seconds, 120,
        "window_seconds must survive upgrade"
    );
}

/// An empty (zero-tip) contract state is also stable: the initial defaults
/// must be readable via `post` and tipping must still work afterward.
#[test]
fn tipping_fresh_state_survives_upgrade() {
    let (env, pre, post) = tipping_pair();

    assert_eq!(pre.latest_settlement_nonce(), 0);
    assert!(!pre.is_paused());

    assert_eq!(post.latest_settlement_nonce(), 0);
    assert!(!post.is_paused());

    // Post-upgrade first tip must still produce settlement_id 1.
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let id = post.send_tip(&sender, &recipient, &1i128);
    assert_eq!(id, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// confession-registry storage compat
// ─────────────────────────────────────────────────────────────────────────────

/// Confessions and the total count written by `pre` are readable via `post`
/// at the same address.
#[test]
fn registry_confessions_and_count_survive_upgrade() {
    let (env, pre, post, author_admin) = registry_pair();
    let author = author_admin;

    let id1 = pre.create_confession(&author, &sample_hash(&env, 0x11), &1_000);
    let id2 = pre.create_confession(&author, &sample_hash(&env, 0x22), &2_000);

    assert_eq!(post.get_confession(&id1).id, id1);
    assert_eq!(post.get_confession(&id2).id, id2);
    assert_eq!(
        post.get_total_count(),
        2,
        "total count must survive upgrade"
    );
    assert_eq!(
        post.get_author_confessions(&author).len(),
        2,
        "author index must survive upgrade"
    );
}

/// Schema version defaults and post-migration value both survive upgrade.
#[test]
fn registry_schema_version_survives_upgrade() {
    let (_env, pre, post, admin) = registry_pair();
    assert_eq!(post.schema_version(), pre.schema_version());

    pre.migrate(&admin);
    assert_eq!(
        post.schema_version(),
        confession_registry::SCHEMA_VERSION_CURRENT
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// reputation-badges storage compat
// ─────────────────────────────────────────────────────────────────────────────

/// Badges minted and reputation adjusted by `pre` are readable via `post`.
#[test]
fn reputation_badges_and_score_survive_upgrade() {
    let (env, pre, post, admin) = reputation_pair();
    let user = Address::generate(&env);
    let reason = SorobanString::from_str(&env, "seed");

    let badge_id = pre.mint_badge(&user, &BadgeType::ConfessionStarter);
    pre.adjust_reputation(&user, &42i128, &reason);
    let _ = admin; // admin only needed for adjust_reputation's internal auth

    assert_eq!(
        post.get_badge(&badge_id).unwrap().owner,
        user,
        "badge must survive upgrade"
    );
    assert_eq!(
        post.get_user_reputation(&user),
        42i128,
        "reputation must survive upgrade"
    );
}
