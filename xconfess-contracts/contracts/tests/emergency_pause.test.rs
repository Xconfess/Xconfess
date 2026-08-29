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

use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient, Error as TippingError};
use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use confession_registry::governance::model::CriticalAction;
use confession_registry::{ConfessionRegistry, ConfessionRegistryClient};
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
    assert!(
        result.is_err(),
        "tipping: non-owner must not be able to pause"
    );
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
        client
            .try_create_confession(&author, &hash, &1_000u64)
            .is_err(),
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

// ═══════════════════════════════════════════════════════════════════════════
// STATE TRANSITION FIXTURE TESTS (#1619)
//
// Ensure pause/unpause state transitions behave correctly across:
//   - Repeated toggle cycles (pause → unpause → pause → unpause)
//   - Double-pause and double-unpause (idempotency guard)
//   - State persistence: data written before pause survives the cycle
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn anchor_repeated_pause_unpause_cycles_behave_correctly() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.initialize(&owner);

    // Cycle 1: pause → unpause
    client.pause(&owner, &SorobanString::from_str(&env, "cycle-1-pause"));
    assert!(client.is_paused());
    client.unpause(&owner, &SorobanString::from_str(&env, "cycle-1-unpause"));
    assert!(!client.is_paused());

    // Write should succeed between cycles
    let hash1 = BytesN::from_array(&env, &[0xAA; 32]);
    client.anchor_confession(&hash1, &100u64);

    // Cycle 2: pause → unpause
    client.pause(&owner, &SorobanString::from_str(&env, "cycle-2-pause"));
    assert!(client.is_paused());
    assert!(
        client
            .try_anchor_confession(&BytesN::from_array(&env, &[0xBB; 32]), &200u64)
            .is_err(),
        "writes must fail during second pause"
    );
    client.unpause(&owner, &SorobanString::from_str(&env, "cycle-2-unpause"));
    assert!(!client.is_paused());

    // Cycle 3: pause → unpause
    client.pause(&owner, &SorobanString::from_str(&env, "cycle-3-pause"));
    assert!(client.is_paused());
    client.unpause(&owner, &SorobanString::from_str(&env, "cycle-3-unpause"));
    assert!(!client.is_paused());

    // Final write succeeds, proving repeated toggles leave no residual state
    let hash2 = BytesN::from_array(&env, &[0xCC; 32]);
    client.anchor_confession(&hash2, &300u64);
    assert_eq!(client.get_confession_count(), 2);
}

#[test]
fn anchor_double_pause_returns_already_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.initialize(&owner);

    client.pause(&owner, &SorobanString::from_str(&env, "first-pause"));
    assert!(client.is_paused());

    // Second pause while already paused must fail
    assert!(
        client
            .try_pause(&owner, &SorobanString::from_str(&env, "double-pause"))
            .is_err(),
        "pausing an already-paused contract must fail (AlreadyPaused)"
    );

    // Contract should remain paused (not toggled off)
    assert!(client.is_paused());
}

#[test]
fn anchor_double_unpause_returns_not_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.initialize(&owner);

    // Contract starts unpaused — unpause must fail
    assert!(
        client
            .try_unpause(&owner, &SorobanString::from_str(&env, "no-op"))
            .is_err(),
        "unpausing an already-unpaused contract must fail (NotPaused)"
    );
    assert!(!client.is_paused());
}

#[test]
fn anchor_state_persists_across_pause_resume() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.initialize(&owner);

    // Write data before pause
    let hash = BytesN::from_array(&env, &[0xDD; 32]);
    client.anchor_confession(&hash, &500u64);
    assert_eq!(client.get_confession_count(), 1);

    // Pause → read-only access to pre-pause data
    client.pause(&owner, &SorobanString::from_str(&env, "maintenance"));
    assert_eq!(client.verify_confession(&hash), Some(500u64));
    assert_eq!(client.get_confession_count(), 1);

    // Unpause → previous data intact
    client.unpause(&owner, &SorobanString::from_str(&env, "done"));
    assert_eq!(client.verify_confession(&hash), Some(500u64));
    assert_eq!(client.get_confession_count(), 1);
}

#[test]
fn tipping_repeated_pause_unpause_cycles_preserve_tips() {
    let env = Env::default();
    env.mock_all_auths();

    let (owner, client) = tipping_setup(&env);
    let recipient = Address::generate(&env);
    let sender = Address::generate(&env);

    // Initial tip
    client.send_tip(&sender, &recipient, &10i128);
    assert_eq!(client.get_tips(&recipient), 10);

    // Cycle 1
    client.pause(&owner, &SorobanString::from_str(&env, "c1-pause"));
    assert!(client.is_paused());
    assert_eq!(
        client.get_tips(&recipient),
        10,
        "tips must be readable while paused"
    );
    client.unpause(&owner, &SorobanString::from_str(&env, "c1-unpause"));

    // Tip after cycle 1
    client.send_tip(&sender, &recipient, &5i128);
    assert_eq!(client.get_tips(&recipient), 15);

    // Cycle 2
    client.pause(&owner, &SorobanString::from_str(&env, "c2-pause"));
    assert!(
        client.try_send_tip(&sender, &recipient, &1i128) == Err(Ok(TippingError::ContractPaused)),
        "tipping: must fail with ContractPaused during second pause"
    );
    client.unpause(&owner, &SorobanString::from_str(&env, "c2-unpause"));

    // Final tip after cycle 2 — accumulated total correct
    client.send_tip(&sender, &recipient, &20i128);
    assert_eq!(client.get_tips(&recipient), 35);
}

#[test]
fn tipping_double_pause_is_idempotent() {
    let env = Env::default();
    env.mock_all_auths();

    let (owner, client) = tipping_setup(&env);

    client.pause(&owner, &SorobanString::from_str(&env, "first"));
    assert!(client.is_paused());

    // Tipping contract treats pause as idempotent — calling again succeeds
    client.pause(&owner, &SorobanString::from_str(&env, "second"));
    assert!(
        client.is_paused(),
        "contract remains paused after double-pause"
    );
}

#[test]
fn tipping_double_unpause_is_idempotent() {
    let env = Env::default();
    env.mock_all_auths();

    let (owner, client) = tipping_setup(&env);

    // Already unpaused — tipping contract treats unpause as idempotent
    client.unpause(&owner, &SorobanString::from_str(&env, "noop"));
    assert!(
        !client.is_paused(),
        "contract remains unpaused after double-unpause"
    );
}

#[test]
fn registry_repeated_pause_unpause_cycles_via_governance() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let author = Address::generate(&env);
    client.initialize(&admin);

    // Write before pause
    let hash1 = BytesN::from_array(&env, &[0x11; 32]);
    let id1 = client.create_confession(&author, &hash1, &100u64);
    assert_eq!(id1, 1);

    // Cycle 1: pause via governance
    let p1 = client.gov_propose(&admin, &CriticalAction::Pause);
    client.gov_approve(&admin, &p1);
    client.gov_execute(&admin, &p1);
    assert!(
        client
            .try_create_confession(&author, &BytesN::from_array(&env, &[0x22; 32]), &200u64)
            .is_err(),
        "cycle 1: writes blocked"
    );
    assert_eq!(client.get_total_count(), 1, "read-only works while paused");

    let u1 = client.gov_propose(&admin, &CriticalAction::Unpause);
    client.gov_approve(&admin, &u1);
    client.gov_execute(&admin, &u1);

    // Write between cycles
    let hash2 = BytesN::from_array(&env, &[0x33; 32]);
    let id2 = client.create_confession(&author, &hash2, &300u64);
    assert_eq!(id2, 2);

    // Cycle 2: pause and unpause again
    let p2 = client.gov_propose(&admin, &CriticalAction::Pause);
    client.gov_approve(&admin, &p2);
    client.gov_execute(&admin, &p2);
    assert!(
        client
            .try_create_confession(&author, &BytesN::from_array(&env, &[0x44; 32]), &400u64)
            .is_err(),
        "cycle 2: writes blocked"
    );

    let u2 = client.gov_propose(&admin, &CriticalAction::Unpause);
    client.gov_approve(&admin, &u2);
    client.gov_execute(&admin, &u2);

    // Final write — all previous data persists
    let hash3 = BytesN::from_array(&env, &[0x55; 32]);
    let id3 = client.create_confession(&author, &hash3, &500u64);
    assert_eq!(id3, 3);
    assert_eq!(client.get_total_count(), 3);
}

#[test]
fn reputation_badges_repeated_toggle_preserves_badges() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin);

    // Award before pause
    client.award_badge(&user, &BadgeType::ConfessionStarter);
    assert!(client.has_badge(&user, &BadgeType::ConfessionStarter));

    // Cycle 1
    client.pause(&SorobanString::from_str(&env, "c1"));
    assert!(client.is_paused());
    assert!(
        client.has_badge(&user, &BadgeType::ConfessionStarter),
        "badge readable while paused"
    );
    client.unpause(&SorobanString::from_str(&env, "c1-end"));

    // Cycle 2
    client.pause(&SorobanString::from_str(&env, "c2"));
    assert!(
        client
            .try_award_badge(&user, &BadgeType::PopularVoice)
            .is_err(),
        "award blocked during second pause"
    );
    client.unpause(&SorobanString::from_str(&env, "c2-end"));

    // Awards resume, pre-pause badges preserved
    client.award_badge(&user, &BadgeType::PopularVoice);
    assert!(client.has_badge(&user, &BadgeType::ConfessionStarter));
    assert!(client.has_badge(&user, &BadgeType::PopularVoice));
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
