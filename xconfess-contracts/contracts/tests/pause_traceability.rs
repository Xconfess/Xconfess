//! Unauthorized-action and traceability tests for emergency pause state changes.
//!
//! The versioned pause event (`PauseStateChangedEvent`) must be emitted only
//! for authorized transitions, must carry actor + reason + a monotonic nonce,
//! and must leave the audit stream untouched on rejected calls.

#![cfg(test)]

extern crate std;

use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient};
use confession_anchor::{
    emergency_pause::events::PAUSE_EVENT_VERSION_V2, ConfessionAnchor, ConfessionAnchorClient,
    Error as AnchorError,
};
use reputation_badges::{ReputationBadges, ReputationBadgesClient};
use soroban_sdk::{
    testutils::Address as _, testutils::Events, Address, Env, IntoVal, String as SorobanString,
    Symbol,
};

fn anchor_client(env: &Env) -> (Address, ConfessionAnchorClient<'static>) {
    let id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(env, &id);
    let owner = Address::generate(env);
    client.initialize(&owner);
    (owner, client)
}

#[test]
fn unauthorized_caller_cannot_pause_and_does_not_advance_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    let (_owner, client) = anchor_client(&env);
    let outsider = Address::generate(&env);

    assert_eq!(
        client.try_pause(&outsider, &SorobanString::from_str(&env, "incident")),
        Err(Ok(AnchorError::NotAuthorized))
    );
    assert!(!client.is_paused());
    assert_eq!(client.pause_event_nonce(), 0);
    assert_eq!(env.events().all().len(), 0);
}

#[test]
fn unauthorized_caller_cannot_unpause_and_does_not_advance_nonce() {
    let env = Env::default();
    env.mock_all_auths();
    let (owner, client) = anchor_client(&env);
    let outsider = Address::generate(&env);

    client.pause(&owner, &SorobanString::from_str(&env, "incident"));
    assert_eq!(
        client.try_unpause(&outsider, &SorobanString::from_str(&env, "resolved")),
        Err(Ok(AnchorError::NotAuthorized))
    );
    assert!(
        client.is_paused(),
        "unauthorized unpause must not change state"
    );
    assert_eq!(client.pause_event_nonce(), 1);
}

#[test]
fn admin_can_pause_and_nonce_is_monotonic_across_repeated_cycles() {
    let env = Env::default();
    env.mock_all_auths();
    let (owner, client) = anchor_client(&env);
    let admin = Address::generate(&env);
    client.grant_admin(&owner, &admin);

    let topic = Symbol::new(&env, "pause_state_changed");
    for expected_nonce in 1..=4_u64 {
        let actor = if expected_nonce % 2 == 0 {
            &admin
        } else {
            &owner
        };
        let reason = SorobanString::from_str(&env, "cycle");
        if expected_nonce % 2 == 1 {
            client.pause(actor, &reason);
        } else {
            client.unpause(actor, &reason);
        }

        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let (_, topics, data) = events.first().unwrap();
        let event_topic: Symbol = topics.first().unwrap().into_val(&env);
        assert_eq!(event_topic, topic);
        let (version, event_actor, event_reason, nonce, _paused, _ts): (
            u32,
            Address,
            SorobanString,
            u64,
            bool,
            u64,
        ) = data.into_val(&env);
        assert_eq!(version, PAUSE_EVENT_VERSION_V2);
        assert_eq!(event_actor, *actor);
        assert_eq!(event_reason, reason);
        assert_eq!(nonce, expected_nonce);
        assert_eq!(client.pause_event_nonce(), expected_nonce);
    }
}

#[test]
fn tipping_pause_requires_the_configured_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &id);
    client.init(&id);
    let owner = Address::generate(&env);
    client.configure_controls(&owner, &1_000, &60);

    let outsider = Address::generate(&env);
    assert!(client
        .try_pause(&outsider, &SorobanString::from_str(&env, "incident"))
        .is_err());
    assert!(!client.is_paused());
}

#[test]
fn badge_pause_requires_the_stored_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    client.pause(&SorobanString::from_str(&env, "incident"));
    let auths = env.auths();
    assert_eq!(auths.len(), 1, "pause must authorize as the stored admin");
    assert_eq!(auths[0].0, admin);
}
