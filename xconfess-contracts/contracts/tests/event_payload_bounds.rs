//! Per-event payload bound verification across the four audited event streams:
//! anchor, tipping, report and badge.
//!
//! Each test exercises the fencepost: the exact bound is accepted, and one
//! extra unit is rejected with a stable error without mutating state.

#![cfg(test)]

extern crate std;

use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient, Error as TippingError};
use confession_anchor::{event_bounds as anchor_bounds, ConfessionAnchor, ConfessionAnchorClient};
use confession_registry::event_bounds as registry_bounds;
use reputation_badges::{
    event_bounds as badge_bounds, Error as BadgeError, ReputationBadges, ReputationBadgesClient,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String as SorobanString};

fn string(env: &Env, len: u32) -> SorobanString {
    SorobanString::from_str(env, &"x".repeat(len as usize))
}

// ── anchor ───────────────────────────────────────────────────────────────────

fn anchor_client(env: &Env) -> (Address, ConfessionAnchorClient<'static>) {
    let id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(env, &id);
    let owner = Address::generate(env);
    client.initialize(&owner);
    (owner, client)
}

#[test]
fn anchor_pause_reason_exact_bound_accepted() {
    let env = Env::default();
    env.mock_all_auths();
    let (owner, client) = anchor_client(&env);
    client.pause(&owner, &string(&env, anchor_bounds::MAX_PAUSE_REASON_LEN));
    assert!(client.is_paused());
    assert_eq!(client.pause_event_nonce(), 1);
}

#[test]
fn anchor_pause_reason_plus_one_rejected_without_state_change() {
    let env = Env::default();
    env.mock_all_auths();
    let (owner, client) = anchor_client(&env);
    assert_eq!(
        client.try_pause(
            &owner,
            &string(&env, anchor_bounds::MAX_PAUSE_REASON_LEN + 1)
        ),
        Err(Ok(confession_anchor::Error::PauseReasonTooLong))
    );
    assert!(!client.is_paused());
    assert_eq!(client.pause_event_nonce(), 0);
}

// ── tipping ──────────────────────────────────────────────────────────────────

fn tipping_client(env: &Env) -> (Address, AnonymousTippingClient<'static>) {
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(env, &id);
    client.init(&id);
    let owner = Address::generate(env);
    client.configure_controls(&owner, &1_000, &60);
    (owner, client)
}

#[test]
fn tipping_proof_metadata_exact_bound_accepted() {
    let env = Env::default();
    env.mock_all_auths();
    let (_owner, client) = tipping_client(&env);
    let recipient = Address::generate(&env);
    let metadata = string(
        &env,
        anonymous_tipping::event_bounds::MAX_TIPPING_PROOF_METADATA_LEN,
    );
    assert_eq!(
        client.send_tip_with_proof(&Address::generate(&env), &recipient, &10, &Some(metadata)),
        1
    );
    assert_eq!(client.get_tips(&recipient), 10);
}

#[test]
fn tipping_proof_metadata_plus_one_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (_owner, client) = tipping_client(&env);
    let metadata = string(
        &env,
        anonymous_tipping::event_bounds::MAX_TIPPING_PROOF_METADATA_LEN + 1,
    );
    assert_eq!(
        client.try_send_tip_with_proof(
            &Address::generate(&env),
            &Address::generate(&env),
            &10,
            &Some(metadata),
        ),
        Err(Ok(TippingError::MetadataTooLong))
    );
    assert_eq!(client.latest_settlement_nonce(), 0);
}

#[test]
fn tipping_pause_reason_is_bounded() {
    let env = Env::default();
    env.mock_all_auths();
    let (owner, client) = tipping_client(&env);
    assert_eq!(
        client.try_pause(
            &owner,
            &string(
                &env,
                anonymous_tipping::event_bounds::MAX_PAUSE_REASON_LEN + 1
            )
        ),
        Err(Ok(TippingError::MetadataTooLong))
    );
    assert!(!client.is_paused());
}

// ── report ───────────────────────────────────────────────────────────────────

#[test]
fn report_reason_bound_is_enforced_with_stable_error() {
    let env = Env::default();
    // Report reason validators are shared by the report event emit path.
    let valid = string(&env, registry_bounds::MAX_REPORT_REASON_LEN);
    let invalid = string(&env, registry_bounds::MAX_REPORT_REASON_LEN + 1);
    assert_eq!(registry_bounds::validate_report_reason(&valid), Ok(()));
    assert_eq!(
        registry_bounds::validate_report_reason(&invalid),
        Err(registry_bounds::EventPayloadError::PayloadTooLarge)
    );
    assert_eq!(
        registry_bounds::validate_report_reason(&invalid)
            .unwrap_err()
            .code(),
        1005
    );
}

// ── badge ────────────────────────────────────────────────────────────────────

fn badge_client(env: &Env) -> ReputationBadgesClient<'static> {
    let id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(env, &id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

#[test]
fn badge_metadata_exact_bound_accepted() {
    let env = Env::default();
    env.mock_all_auths();
    let client = badge_client(&env);
    let max = badge_bounds::MAX_BADGE_METADATA_LEN;
    client.create_badge(
        &reputation_badges::BadgeType::ConfessionStarter,
        &string(&env, max),
        &string(&env, max),
        &string(&env, max),
    );
    assert!(client
        .get_badge_type_metadata(&reputation_badges::BadgeType::ConfessionStarter)
        .is_some());
}

#[test]
fn badge_metadata_plus_one_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = badge_client(&env);
    let over = badge_bounds::MAX_BADGE_METADATA_LEN + 1;
    assert_eq!(
        client.try_create_badge(
            &reputation_badges::BadgeType::PopularVoice,
            &string(&env, over),
            &string(&env, 1),
            &string(&env, 1),
        ),
        Err(Ok(BadgeError::MetadataTooLong))
    );
    assert!(client
        .get_badge_type_metadata(&reputation_badges::BadgeType::PopularVoice)
        .is_none());
}

#[test]
fn badge_pause_reason_is_bounded() {
    let env = Env::default();
    env.mock_all_auths();
    let client = badge_client(&env);
    assert_eq!(
        client.try_pause(&string(&env, badge_bounds::MAX_PAUSE_REASON_LEN + 1)),
        Err(Ok(BadgeError::MetadataTooLong))
    );
    assert!(!client.is_paused());
}

// ── table integrity ──────────────────────────────────────────────────────────

#[test]
fn every_bounded_event_field_is_documented() {
    // All four audited event families are represented in the shared table.
    for event in [
        "PauseStateChangedEvent",
        "SettlementEvent",
        "ReportSubmittedLedgerEvent",
        "BadgeEvent",
    ] {
        assert!(
            anchor_bounds::EVENT_PAYLOAD_BOUNDS
                .iter()
                .any(|b| b.event == event),
            "missing bound for {event}"
        );
    }
    // The four crates agree on the shared constants.
    assert_eq!(
        anchor_bounds::MAX_PAUSE_REASON_LEN,
        badge_bounds::MAX_PAUSE_REASON_LEN
    );
    assert_eq!(anchor_bounds::MAX_REPORT_REASON_LEN, 128);
    assert_eq!(registry_bounds::MAX_TIPPING_PROOF_METADATA_LEN, 128);
}
