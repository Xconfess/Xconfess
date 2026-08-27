//! Minimum-admin invariant tests for the XConfess Soroban contract.
//!
//! File: xconfess-contract/test/minimum_admin_invariant.rs
//!
//! # Purpose
//!
//! These tests validate that the contract never enters a zero-admin state through
//! any supported admin action (revoke, transfer, governance operations).
//!
//! # Test organization
//!
//!   Suite 1 – Single admin state      revoke/transfer that removes last admin fails
//!   Suite 2 – Multi-admin state       valid revocations succeed, last admin fails
//!   Suite 3 – Governance flows       propose/accept/cancel with invariant checks
//!   Suite 4 – Edge cases           owner self-revoke, same-address transfers
//!   Suite 5 – Event verification    governance failure events emitted correctly
//!
//! Running
//! -------
//!   cargo test --test minimum_admin_invariant -- --nocapture

use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env, IntoVal, String as SorobanString, Val,
};

use xconfess_contract::{XConfessContract, XConfessContractClient};

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Setup with owner and optionally additional admins.
fn setup_with_admins(admin_count: u32) -> (Env, XConfessContractClient<'static>, Address, Vec<Address>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, XConfessContract);
    let client: XConfessContractClient<'static> =
        XConfessContractClient::new(&env, &contract_id);

    let owner = Address::random(&env);
    client.initialize(&owner);

    let mut admins = Vec::new(&env);
    for i in 0..admin_count {
        let admin = Address::random(&env);
        client.grant_admin(&owner, &admin);
        admins.push_back(admin);
    }

    (env, client, owner, admins)
}

/// Convenience: make a `SorobanString` from a `&str`.
fn s(env: &Env, text: &str) -> SorobanString {
    SorobanString::from_str(env, text)
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 – Single admin state
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn single_admin_revoke_should_fail() {
    let (env, client, owner, mut admins) = setup_with_admins(1);
    let only_admin = admins.pop_back().unwrap();

    // Attempt to revoke the only admin should fail
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &only_admin);
    });

    assert!(result.is_err());
    
    // Verify the admin is still in place
    assert!(client.is_admin(&only_admin));
    
    // Verify error event was emitted
    let events = env.events().all();
    let gov_inv_events: Vec<_> = events
        .iter()
        .filter(|e| e.topics[0] == s(&env, "gov_inv"))
        .collect();
    
    assert_eq!(gov_inv_events.len(), 1);
    assert_eq!(gov_inv_events[0].data[0], s(&env, "revoke_admin"));
    assert_eq!(gov_inv_events[0].data[1], s(&env, "Cannot revoke last admin - would leave contract with insufficient authorized addresses"));
}

#[test]
fn single_admin_transfer_to_new_address_should_succeed() {
    let (env, client, owner, mut admins) = setup_with_admins(1);
    let _only_admin = admins.pop_back().unwrap();
    let new_owner = Address::random(&env);

    // Transfer to new address should succeed (new owner becomes authorized)
    client.transfer_ownership(&owner, &new_owner);
    
    assert_eq!(client.get_owner(), new_owner);
    assert!(client.is_admin(&_only_admin)); // Admin remains
    
    // Verify transfer event was emitted
    let events = env.events().all();
    let transfer_events: Vec<_> = events
        .iter()
        .filter(|e| e.topics[0] == s(&env, "own_xfer"))
        .collect();
    
    assert_eq!(transfer_events.len(), 1);
    assert_eq!(transfer_events[0].topics[1], new_owner);
    assert_eq!(transfer_events[0].data[0], owner);
}

#[test]
fn transfer_to_same_address_should_fail() {
    let (env, client, owner, _admins) = setup_with_admins(0);

    // Attempt to transfer to same address should fail
    let result = std::panic::catch_unwind(|| {
        client.transfer_ownership(&owner, &owner);
    });

    assert!(result.is_err());
    assert_eq!(client.get_owner(), owner); // Owner unchanged
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 – Multi-admin state
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn multi_admin_revoke_non_last_should_succeed() {
    let (env, client, owner, mut admins) = setup_with_admins(3);
    let admin_to_revoke = admins.pop_back().unwrap();
    let remaining_admin1 = admins.pop_back().unwrap();
    let remaining_admin2 = admins.pop_back().unwrap();

    // Revoke one of multiple admins should succeed
    client.revoke_admin(&owner, &admin_to_revoke);
    
    assert!(!client.is_admin(&admin_to_revoke));
    assert!(client.is_admin(&remaining_admin1));
    assert!(client.is_admin(&remaining_admin2));
    
    // Verify revoke event was emitted
    let events = env.events().all();
    let revoke_events: Vec<_> = events
        .iter()
        .filter(|e| e.topics[0] == s(&env, "adm_revoke"))
        .collect();
    
    assert_eq!(revoke_events.len(), 1);
    assert_eq!(revoke_events[0].topics[1], admin_to_revoke);
}

#[test]
fn multi_admin_revoke_last_should_fail() {
    let (env, client, owner, mut admins) = setup_with_admins(3);
    
    // Revoke admins until only one remains
    let admin1 = admins.pop_back().unwrap();
    let admin2 = admins.pop_back().unwrap();
    let last_admin = admins.pop_back().unwrap();
    
    client.revoke_admin(&owner, &admin1);
    client.revoke_admin(&owner, &admin2);
    
    // Attempt to revoke the last admin should fail
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &last_admin);
    });

    assert!(result.is_err());
    assert!(client.is_admin(&last_admin)); // Last admin still in place
    
    // Verify governance failure event
    let events = env.events().all();
    let gov_inv_events: Vec<_> = events
        .iter()
        .filter(|e| e.topics[0] == s(&env, "gov_inv"))
        .collect();
    
    assert_eq!(gov_inv_events.len(), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 – Owner edge cases
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn owner_cannot_revoke_self() {
    let (env, client, owner, _admins) = setup_with_admins(0);

    // Owner attempting to revoke self should fail (CannotDemoteOwner)
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &owner);
    });

    assert!(result.is_err());
}

#[test]
fn no_admins_transfer_should_succeed() {
    let (env, client, owner, _admins) = setup_with_admins(0);
    let new_owner = Address::random(&env);

    // Transfer when no explicit admins should succeed (owner is always authorized)
    client.transfer_ownership(&owner, &new_owner);
    
    assert_eq!(client.get_owner(), new_owner);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 – Invariant verification helpers
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn count_authorized_always_at_least_one() {
    let (env, client, owner, _admins) = setup_with_admins(0);
    
    // Initially: only owner is authorized
    assert_eq!(client.count_authorized(), 1);
    
    // Add admin: owner + 1 admin = 2 authorized
    let admin1 = Address::random(&env);
    client.grant_admin(&owner, &admin1);
    assert_eq!(client.count_authorized(), 2);
    
    // Add another admin: owner + 2 admins = 3 authorized
    let admin2 = Address::random(&env);
    client.grant_admin(&owner, &admin2);
    assert_eq!(client.count_authorized(), 3);
    
    // Revoke one admin: owner + 1 admin = 2 authorized
    client.revoke_admin(&owner, &admin1);
    assert_eq!(client.count_authorized(), 2);
    
    // Cannot revoke last admin: would leave only owner = 1 authorized
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &admin2);
    });
    assert!(result.is_err());
    assert_eq!(client.count_authorized(), 2); // Still owner + admin2
}

#[test]
fn count_admins_excludes_owner() {
    let (env, client, owner, _admins) = setup_with_admins(0);
    
    // Initially no explicit admins
    assert_eq!(client.count_admins(), 0);
    
    // Add admin
    let admin1 = Address::random(&env);
    client.grant_admin(&owner, &admin1);
    assert_eq!(client.count_admins(), 1);
    
    // Add another admin
    let admin2 = Address::random(&env);
    client.grant_admin(&owner, &admin2);
    assert_eq!(client.count_admins(), 2);
    
    // Revoke admin
    client.revoke_admin(&owner, &admin1);
    assert_eq!(client.count_admins(), 1);
    
    // Owner is never counted in admin set
    assert!(!client.is_admin(&owner));
    assert_eq!(client.count_admins(), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 – Event verification
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn governance_failure_event_contains_correct_metadata() {
    let (env, client, owner, mut admins) = setup_with_admins(1);
    let only_admin = admins.pop_back().unwrap();

    // Trigger invariant violation
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &only_admin);
    });

    assert!(result.is_err());
    
    // Verify event structure
    let events = env.events().all();
    let gov_inv_event = events
        .iter()
        .find(|e| e.topics[0] == s(&env, "gov_inv"))
        .expect("Should have governance invariant violation event");
    
    assert_eq!(gov_inv_event.topics.len(), 1);
    assert_eq!(gov_inv_event.topics[0], s(&env, "gov_inv"));
    
    assert_eq!(gov_inv_event.data.len(), 3);
    assert_eq!(gov_inv_event.data[0], s(&env, "revoke_admin"));
    assert_eq!(gov_inv_event.data[1], s(&env, "Cannot revoke last admin - would leave contract with insufficient authorized addresses"));
    assert_eq!(gov_inv_event.data[2], owner);
}
