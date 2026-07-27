//! Cross-contract emergency pause integration tests (#1484).
//!
//! Each contract enforces its own pause flag using either the shared
//! `emergency_pause` module (confession-anchor) or a self-contained
//! equivalent (anonymous-tipping, reputation-badges) or a governance-gated
//! toggle (confession-registry). Per-contract unit suites already exercise
//! this in isolation; this file proves the guarantee holds consistently
//! *across all four mutating contracts* in one place:
//!
//!   - All mutating entry points fail while paused.
//!   - Read-only entry points keep working while paused.
//!   - An authorized admin can pause and unpause.
//!   - An unauthorized caller cannot pause.

extern crate std;

use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use confession_registry::governance::model::CriticalAction;
use confession_registry::{ConfessionRegistry, ConfessionRegistryClient};
use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient, Error as TippingError};
use reputation_badges::{BadgeType, ReputationBadges, ReputationBadgesClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String as SorobanString};

// ═══════════════════════════════════════════════════════════════════════════
// confession-anchor
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn anchor_pause_blocks_anchor_confession_and_admin_can_unpause() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.initialize(&owner);

    let reason = SorobanString::from_str(&env, "incident");
    client.pause(&owner, &reason);
    assert!(client.is_paused(), "anchor: must report paused");

    let hash = BytesN::from_array(&env, &[0x11; 32]);
    assert!(
        client.try_anchor_confession(&hash, &1_000u64).is_err(),
        "anchor: anchor_confession must fail while paused"
    );

    // Read-only calls remain available while paused.
    assert_eq!(client.verify_confession(&hash), None);
    assert_eq!(client.get_confession_count(), 0);

    client.unpause(&owner, &reason);
    assert!(!client.is_paused());
    assert_eq!(
        client.anchor_confession(&hash, &1_000u64),
        soroban_sdk::symbol_short!("anchored"),
        "anchor: writes must resume after unpause"
    );
}

#[test]
fn anchor_unauthorized_caller_cannot_pause() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let outsider = Address::generate(&env);
    client.initialize(&owner);

    let reason = SorobanString::from_str(&env, "incident");
    assert!(
        client.try_pause(&outsider, &reason).is_err(),
        "anchor: non-owner/non-admin must not be able to pause"
    );
    assert!(!client.is_paused());
}

// ═══════════════════════════════════════════════════════════════════════════
// anonymous-tipping
// ═══════════════════════════════════════════════════════════════════════════

fn tipping_setup(env: &Env) -> (Address, AnonymousTippingClient<'static>) {
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(env, &id);
    client.init(&id);
    let owner = Address::generate(env);
    client.configure_controls(&owner, &1_000u32, &60u64);
    (owner, client)
}

#[test]
fn tipping_pause_blocks_send_tip_and_admin_can_unpause() {
    let env = Env::default();
    env.mock_all_auths();

    let (owner, client) = tipping_setup(&env);
    let recipient = Address::generate(&env);

    client.pause(&owner, &SorobanString::from_str(&env, "incident"));
    assert!(client.is_paused(), "tipping: must report paused");

    assert_eq!(
        client.try_send_tip(&Address::generate(&env), &recipient, &1i128),
        Err(Ok(TippingError::ContractPaused)),
        "tipping: send_tip must fail while paused"
    );

    // Read-only calls remain available while paused.
    assert_eq!(client.get_tips(&recipient), 0);
    let _ = client.is_paused();

    client.unpause(&owner, &SorobanString::from_str(&env, "resolved"));
    assert!(!client.is_paused());
    client.send_tip(&Address::generate(&env), &recipient, &5i128);
    assert_eq!(client.get_tips(&recipient), 5);
}

#[test]
fn tipping_unauthorized_caller_cannot_pause() {
    let env = Env::default();
    env.mock_all_auths();

    let (_owner, client) = tipping_setup(&env);
    let outsider = Address::generate(&env);

    let result = client.try_pause(&outsider, &SorobanString::from_str(&env, "incident"));
    assert!(result.is_err(), "tipping: non-owner must not be able to pause");
    assert!(!client.is_paused());
}

// ═══════════════════════════════════════════════════════════════════════════
// reputation-badges
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn reputation_badges_pause_blocks_award_badge_and_admin_can_unpause() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin);

    client.pause(&SorobanString::from_str(&env, "incident"));
    assert!(client.is_paused(), "reputation-badges: must report paused");

    assert!(
        client
            .try_award_badge(&user, &BadgeType::ConfessionStarter)
            .is_err(),
        "reputation-badges: award_badge must fail while paused"
    );

    // Read-only calls remain available while paused.
    assert!(!client.has_badge(&user, &BadgeType::ConfessionStarter));
    assert_eq!(client.get_admin(), admin);

    client.unpause(&SorobanString::from_str(&env, "resolved"));
    assert!(!client.is_paused());
    client.award_badge(&user, &BadgeType::ConfessionStarter);
    assert!(client.has_badge(&user, &BadgeType::ConfessionStarter));
}

#[test]
fn reputation_badges_pause_requires_the_stored_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.pause(&SorobanString::from_str(&env, "incident"));

    // Pausing authorizes as the stored admin — no other address can satisfy
    // this, even under mock_all_auths (which only removes signature
    // verification, not the "which address" requirement).
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
}

// ═══════════════════════════════════════════════════════════════════════════
// confession-registry (pause is governance-gated: propose → approve → execute)
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn registry_governance_pause_blocks_create_confession_and_execute_can_unpause() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let author = Address::generate(&env);
    client.initialize(&admin);

    let pause_id = client.gov_propose(&admin, &CriticalAction::Pause);
    client.gov_approve(&admin, &pause_id);
    client.gov_execute(&admin, &pause_id);

    let hash = BytesN::from_array(&env, &[0x22; 32]);
    assert!(
        client.try_create_confession(&author, &hash, &1_000u64).is_err(),
        "registry: create_confession must fail while paused"
    );

    // Read-only calls remain available while paused.
    assert_eq!(client.get_total_count(), 0);

    let unpause_id = client.gov_propose(&admin, &CriticalAction::Unpause);
    client.gov_approve(&admin, &unpause_id);
    client.gov_execute(&admin, &unpause_id);

    let id = client.create_confession(&author, &hash, &2_000u64);
    assert_eq!(id, 1, "registry: writes must resume after unpause");
}

#[test]
fn registry_unauthorized_caller_cannot_propose_or_execute_pause() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let outsider = Address::generate(&env);
    client.initialize(&admin);

    // An outsider cannot even propose a critical action.
    assert!(
        client
            .try_gov_propose(&outsider, &CriticalAction::Pause)
            .is_err(),
        "registry: an outsider must not be able to propose a pause"
    );

    // A legitimately-proposed action still cannot be executed by an outsider
    // lacking admin authorization.
    let pause_id = client.gov_propose(&admin, &CriticalAction::Pause);
    assert!(
        client.try_gov_execute(&outsider, &pause_id).is_err(),
        "registry: an outsider must not be able to execute a pause proposal"
    );

    let author = Address::generate(&env);
    let hash = BytesN::from_array(&env, &[0x33; 32]);
    // Contract must remain unpaused — neither bogus attempt took effect.
    client.create_confession(&author, &hash, &3_000u64);
}
