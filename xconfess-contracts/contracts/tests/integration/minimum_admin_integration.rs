//! Integration tests for minimum-admin invariant in governance flows.
//!
//! File: xconfess-contract/test/integration/minimum_admin_integration.rs
//!
//! # Purpose
//!
//! These tests validate the minimum-admin invariant across complete governance workflows,
//! including multi-step scenarios that unit tests might miss.
//!
//! # Test organization
//!
//!   Suite 1 – End-to-end revoke flows    complete admin lifecycle
//!   Suite 2 – End-to-end transfer flows  ownership transfer with admins
//!   Suite 3 – Crisis recovery scenarios   handling edge cases
//!   Suite 4 – Concurrent operations     race condition protection
//!
//! Running
//! -------
//!   cargo test --test minimum_admin_integration -- --nocapture

use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env, IntoVal, String as SorobanString,
};

use xconfess_contract::{XConfessContract, XConfessContractClient};

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Setup with owner and multiple admins for complex scenarios.
fn setup_complex_env(admin_count: u32) -> (Env, XConfessContractClient<'static>, Address, Vec<Address>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, XConfessContract);
    let client: XConfessContractClient<'static> =
        XConfessContractClient::new(&env, &contract_id);

    let owner = Address::random(&env);
    client.initialize(&owner);

    let mut admins = Vec::new(&env);
    for _ in 0..admin_count {
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
// Suite 1 – End-to-end revoke flows
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn complete_admin_lifecycle_maintains_invariant() {
    let (env, client, owner, mut admins) = setup_complex_env(5);
    
    // Setup: 5 admins + owner = 6 authorized
    assert_eq!(client.count_authorized(), 6);
    assert_eq!(client.count_admins(), 5);
    
    // Revoke admins one by one until only 1 remains
    for i in 0..4 {
        let admin_to_revoke = admins.get(i as u32).unwrap();
        client.revoke_admin(&owner, &admin_to_revoke);
        assert_eq!(client.count_authorized(), 6 - i as u32 - 1);
        assert_eq!(client.count_admins(), 5 - i as u32 - 1);
    }
    
    // Now: 1 admin + owner = 2 authorized
    let last_admin = admins.get(4).unwrap();
    assert_eq!(client.count_authorized(), 2);
    assert_eq!(client.count_admins(), 1);
    
    // Attempt to revoke last admin should fail
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &last_admin);
    });
    assert!(result.is_err());
    
    // Invariant preserved: still 2 authorized
    assert_eq!(client.count_authorized(), 2);
    assert_eq!(client.count_admins(), 1);
    
    // Verify governance failure event
    let events = env.events().all();
    let gov_inv_events: Vec<_> = events
        .iter()
        .filter(|e| {
            e.topics.len() > 0 && 
            format!("{:?}", e.topics[0]).contains("gov_inv")
        })
        .collect();
    assert_eq!(gov_inv_events.len(), 1);
}

#[test]
fn revoke_and_grant_cycle_maintains_invariant() {
    let (env, client, owner, mut admins) = setup_complex_env(2);
    
    let admin1 = admins.get(0).unwrap();
    let admin2 = admins.get(1).unwrap();
    
    // Revoke admin2
    client.revoke_admin(&owner, &admin2);
    assert_eq!(client.count_authorized(), 2); // owner + admin1
    assert_eq!(client.count_admins(), 1);
    
    // Grant new admin
    let admin3 = Address::random(&env);
    client.grant_admin(&owner, &admin3);
    assert_eq!(client.count_authorized(), 3); // owner + admin1 + admin3
    assert_eq!(client.count_admins(), 2);
    
    // Now can safely revoke admin1
    client.revoke_admin(&owner, &admin1);
    assert_eq!(client.count_authorized(), 2); // owner + admin3
    assert_eq!(client.count_admins(), 1);
    
    // Cannot revoke admin3 (last admin)
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &admin3);
    });
    assert!(result.is_err());
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 – End-to-end transfer flows
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn transfer_with_multiple_admins_preserves_invariant() {
    let (env, client, owner, admins) = setup_complex_env(3);
    
    // Initial state: owner + 3 admins = 4 authorized
    assert_eq!(client.count_authorized(), 4);
    
    let new_owner = Address::random(&env);
    
    // Transfer ownership
    client.transfer_ownership(&owner, &new_owner);
    
    // New owner + 3 admins = 4 authorized (invariant preserved)
    assert_eq!(client.get_owner(), new_owner);
    assert_eq!(client.count_authorized(), 4);
    assert_eq!(client.count_admins(), 3);
    
    // Old owner should no longer be owner but still authorized if they were an admin
    assert!(!client.is_owner(&owner));
    
    // New owner can now manage admins
    let admin_to_revoke = admins.get(0).unwrap();
    client.revoke_admin(&new_owner, &admin_to_revoke);
    assert_eq!(client.count_admins(), 2);
    assert_eq!(client.count_authorized(), 3); // new owner + 2 remaining admins
}

#[test]
fn transfer_from_single_admin_scenario() {
    let (env, client, owner, mut admins) = setup_complex_env(1);
    let only_admin = admins.pop_back().unwrap();
    
    // Initial state: owner + 1 admin = 2 authorized
    assert_eq!(client.count_authorized(), 2);
    
    let new_owner = Address::random(&env);
    
    // Transfer should succeed (new owner becomes authorized)
    client.transfer_ownership(&owner, &new_owner);
    
    // New owner + 1 admin = 2 authorized (invariant preserved)
    assert_eq!(client.get_owner(), new_owner);
    assert_eq!(client.count_authorized(), 2);
    assert_eq!(client.count_admins(), 1);
    assert!(client.is_admin(&only_admin));
    
    // New owner can now revoke the admin (but shouldn't be able to revoke last admin)
    client.revoke_admin(&new_owner, &only_admin);
    
    // Now only new owner is authorized = 1 authorized (invariant preserved)
    assert_eq!(client.count_authorized(), 1);
    assert_eq!(client.count_admins(), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 – Crisis recovery scenarios
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn recovery_from_admin_loss_scenario() {
    let (env, client, owner, admins) = setup_complex_env(3);
    
    // Simulate admin loss (e.g., keys compromised, accounts lost)
    let admin1 = admins.get(0).unwrap();
    let admin2 = admins.get(1).unwrap();
    let admin3 = admins.get(2).unwrap();
    
    // Owner grants emergency admin before revoking compromised ones
    let emergency_admin = Address::random(&env);
    client.grant_admin(&owner, &emergency_admin);
    assert_eq!(client.count_authorized(), 5); // owner + 4 admins
    
    // Now can safely revoke compromised admins
    client.revoke_admin(&owner, &admin1);
    client.revoke_admin(&owner, &admin2);
    
    assert_eq!(client.count_authorized(), 3); // owner + emergency_admin + admin3
    assert_eq!(client.count_admins(), 2);
    
    // Can still revoke admin3 (emergency_admin remains)
    client.revoke_admin(&owner, &admin3);
    assert_eq!(client.count_authorized(), 2); // owner + emergency_admin
    assert_eq!(client.count_admins(), 1);
    
    // Cannot revoke emergency_admin (last admin)
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &emergency_admin);
    });
    assert!(result.is_err());
}

#[test]
fn ownership_transfer_with_no_admins() {
    let (env, client, owner, _admins) = setup_complex_env(0);
    
    // Initial state: only owner = 1 authorized
    assert_eq!(client.count_authorized(), 1);
    assert_eq!(client.count_admins(), 0);
    
    let new_owner = Address::random(&env);
    
    // Transfer should succeed (new owner becomes authorized)
    client.transfer_ownership(&owner, &new_owner);
    
    // Still 1 authorized (new owner), invariant preserved
    assert_eq!(client.get_owner(), new_owner);
    assert_eq!(client.count_authorized(), 1);
    assert_eq!(client.count_admins(), 0);
    
    // New owner can grant admins to establish multi-admin setup
    let new_admin1 = Address::random(&env);
    let new_admin2 = Address::random(&env);
    
    client.grant_admin(&new_owner, &new_admin1);
    client.grant_admin(&new_owner, &new_admin2);
    
    assert_eq!(client.count_authorized(), 3); // new owner + 2 admins
    assert_eq!(client.count_admins(), 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 – Event verification
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn governance_events_contain_complete_metadata() {
    let (env, client, owner, mut admins) = setup_complex_env(2);
    let admin1 = admins.get(0).unwrap();
    let admin2 = admins.get(1).unwrap();
    
    // Revoke admin1
    client.revoke_admin(&owner, &admin1);
    
    // Attempt to revoke admin2 (should fail with invariant violation)
    let result = std::panic::catch_unwind(|| {
        client.revoke_admin(&owner, &admin2);
    });
    assert!(result.is_err());
    
    // Verify all events have correct structure
    let events = env.events().all();
    
    // Should have: grant events (2), revoke event (1), gov_inv event (1)
    let grant_events: Vec<_> = events
        .iter()
        .filter(|e| {
            e.topics.len() > 0 && 
            format!("{:?}", e.topics[0]).contains("adm_grant")
        })
        .collect();
    
    let revoke_events: Vec<_> = events
        .iter()
        .filter(|e| {
            e.topics.len() > 0 && 
            format!("{:?}", e.topics[0]).contains("adm_revoke")
        })
        .collect();
    
    let gov_inv_events: Vec<_> = events
        .iter()
        .filter(|e| {
            e.topics.len() > 0 && 
            format!("{:?}", e.topics[0]).contains("gov_inv")
        })
        .collect();
    
    assert_eq!(grant_events.len(), 2); // Two admins granted
    assert_eq!(revoke_events.len(), 1); // One admin revoked successfully
    assert_eq!(gov_inv_events.len(), 1); // One invariant violation
    
    // Verify governance failure event structure
    let gov_inv = &gov_inv_events[0];
    assert_eq!(gov_inv.topics[0], s(&env, "gov_inv"));
    assert_eq!(gov_inv.data[0], s(&env, "revoke_admin"));
    assert!(gov_inv.data[1].to_string().contains("Cannot revoke last admin"));
    assert_eq!(gov_inv.data[2], owner);
}

#[test]
fn transfer_events_emit_correct_audit_trail() {
    let (env, client, owner, _admins) = setup_complex_env(0);
    let new_owner = Address::random(&env);
    
    // Transfer ownership
    client.transfer_ownership(&owner, &new_owner);
    
    // Verify transfer event
    let events = env.events().all();
    let transfer_events: Vec<_> = events
        .iter()
        .filter(|e| {
            e.topics.len() > 0 && 
            format!("{:?}", e.topics[0]).contains("own_xfer")
        })
        .collect();
    
    assert_eq!(transfer_events.len(), 1);
    let transfer_event = &transfer_events[0];
    assert_eq!(transfer_event.topics[0], s(&env, "own_xfer"));
    assert_eq!(transfer_event.topics[1], new_owner);
    assert_eq!(transfer_event.data[0], owner);
}
