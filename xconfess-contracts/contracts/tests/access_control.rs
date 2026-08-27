//! Access-control tests for the XConfess Soroban contract.
//!
//! File: xconfess-contract/test/access_control.rs
//!
//! # What changed from the original test file
//!
//! Every `#[should_panic]` test and every `std::panic::catch_unwind` block has
//! been replaced with `Result`-based assertions. The contract now returns typed
//! `AccessError` codes instead of panicking, so tests match on the error
//! variant directly — no string parsing, no catch_unwind, no opaque payload.
//!
//! # Test organisation
//!
//!   Suite 1  – Initialization          owner set on init; double-init blocked
//!   Suite 2  – Admin grant             happy path, duplicate, event emitted
//!   Suite 3  – Admin revoke            happy path, not-admin guard, owner guard
//!   Suite 4  – Ownership transfer      happy path, old owner loses privilege,
//!                                      new owner gains privilege, event emitted
//!   Suite 5  – resolve() role guard    admin resolves, owner resolves,
//!                                      stranger rejected with NotAuthorized (2)
//!   Suite 6  – update_config() guard   owner succeeds, admin rejected, stranger rejected
//!   Suite 7  – assign/revoke guards    non-owner attempts rejected
//!   Suite 8  – View methods            is_owner, is_admin, can_moderate, get_owner
//!   Suite 9  – Error code contract     discriminant values pinned
//!   Suite 10 – Event emission          audit trail verified via env.events()
//!   Suite 11 – Minimum-Admin Invariant at-least-one-admin enforced
//!
//! # Running
//!
//!   cargo test --test access_control -- --nocapture

use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env, String as SorobanString,
};

use xconfess_contract::{XConfessContract, XConfessContractClient, AccessError};

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

fn setup_with_owner() -> (Env, XConfessContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(XConfessContract, ());
    let client: XConfessContractClient<'static> =
        XConfessContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    client.initialize(&owner).expect("initialize must succeed");

    (env, client, owner)
}

fn s(env: &Env, text: &str) -> SorobanString {
    SorobanString::from_str(env, text)
}

fn make_confession(client: &XConfessContractClient, env: &Env) -> u32 {
    client.create(&s(env, "Test confession.")).expect("create must succeed")
}

fn make_reported_confession(client: &XConfessContractClient, env: &Env) -> u32 {
    let id = make_confession(client, env);
    client.report(&id, &s(env, "spam")).expect("report must succeed");
    id
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 – Initialization
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn initialize_sets_owner() {
    let (env, client, owner) = setup_with_owner();
    assert!(client.is_owner(&owner));
    assert_eq!(client.get_owner(), owner);
}

#[test]
fn initialize_owner_is_not_in_admin_set() {
    let (env, client, owner) = setup_with_owner();
    assert!(!client.is_admin(&owner));
}

#[test]
fn owner_can_moderate_via_can_moderate() {
    let (env, client, owner) = setup_with_owner();
    assert!(client.can_moderate(&owner));
}

#[test]
fn double_initialize_returns_already_initialized() {
    let (env, client, _owner) = setup_with_owner();
    let other = Address::generate(&env);
    let result = client.try_initialize(&other);
    assert_eq!(result, Err(Ok(AccessError::AlreadyInitialized)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 – Admin grant
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn owner_can_grant_admin() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);

    client.assign_admin(&owner, &admin).expect("grant must succeed");

    assert!(client.is_admin(&admin));
    assert!(client.can_moderate(&admin));
}

#[test]
fn owner_can_grant_multiple_admins() {
    let (env, client, owner) = setup_with_owner();
    let admin_a = Address::generate(&env);
    let admin_b = Address::generate(&env);

    client.assign_admin(&owner, &admin_a).expect("grant a must succeed");
    client.assign_admin(&owner, &admin_b).expect("grant b must succeed");

    assert!(client.is_admin(&admin_a));
    assert!(client.is_admin(&admin_b));
}

#[test]
fn granting_admin_twice_returns_already_admin() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);

    client.assign_admin(&owner, &admin).expect("first grant must succeed");
    let result = client.try_assign_admin(&owner, &admin);
    assert_eq!(result, Err(Ok(AccessError::AlreadyAdmin)));
}

#[test]
fn non_owner_cannot_grant_admin_returns_not_owner() {
    let (env, client, _owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    let target   = Address::generate(&env);

    let result = client.try_assign_admin(&stranger, &target);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

#[test]
fn admin_cannot_grant_other_admins_returns_not_owner() {
    let (env, client, owner) = setup_with_owner();
    let admin  = Address::generate(&env);
    let target = Address::generate(&env);

    client.assign_admin(&owner, &admin).expect("grant must succeed");
    let result = client.try_assign_admin(&admin, &target);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 – Admin revoke
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn owner_can_revoke_admin_when_multiple_admins_exist() {
    let (env, client, owner) = setup_with_owner();
    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    client.assign_admin(&owner, &admin1).unwrap();
    client.assign_admin(&owner, &admin2).unwrap();

    client.revoke_admin(&owner, &admin1).expect("revoke must succeed");

    assert!(!client.is_admin(&admin1));
    assert!(!client.can_moderate(&admin1));
    assert!(client.is_admin(&admin2));
}

#[test]
fn revoking_non_admin_returns_not_admin() {
    let (env, client, owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    // Need at least one admin so the minimum-admin guard isn't hit first
    let dummy = Address::generate(&env);
    client.assign_admin(&owner, &dummy).unwrap();

    let result = client.try_revoke_admin(&owner, &stranger);
    assert_eq!(result, Err(Ok(AccessError::NotAdmin)));
}

#[test]
fn owner_cannot_revoke_themselves_returns_cannot_demote_owner() {
    let (env, client, owner) = setup_with_owner();
    let result = client.try_revoke_admin(&owner, &owner);
    assert_eq!(result, Err(Ok(AccessError::CannotDemoteOwner)));
}

#[test]
fn non_owner_cannot_revoke_admin_returns_not_owner() {
    let (env, client, owner) = setup_with_owner();
    let admin    = Address::generate(&env);
    let dummy    = Address::generate(&env);
    let stranger = Address::generate(&env);

    client.assign_admin(&owner, &admin).unwrap();
    client.assign_admin(&owner, &dummy).unwrap();

    let result = client.try_revoke_admin(&stranger, &admin);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

#[test]
fn revoked_admin_loses_resolve_privilege() {
    let (env, client, owner) = setup_with_owner();
    let admin  = Address::generate(&env);
    let admin2 = Address::generate(&env);

    client.assign_admin(&owner, &admin).unwrap();
    client.assign_admin(&owner, &admin2).unwrap();

    let id = make_reported_confession(&client, &env);
    client.resolve(&admin, &id).expect("resolve before revoke must succeed");

    client.revoke_admin(&owner, &admin).unwrap();

    let id2    = make_reported_confession(&client, &env);
    let result = client.try_resolve(&admin, &id2);
    assert_eq!(result, Err(Ok(AccessError::NotAuthorized)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 – Ownership transfer
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn owner_can_transfer_ownership() {
    let (env, client, owner) = setup_with_owner();
    let new_owner = Address::generate(&env);

    client.transfer_ownership(&owner, &new_owner).expect("transfer must succeed");

    assert_eq!(client.get_owner(), new_owner);
    assert!(client.is_owner(&new_owner));
    assert!(!client.is_owner(&owner));
}

#[test]
fn new_owner_can_grant_admin_after_transfer() {
    let (env, client, owner) = setup_with_owner();
    let new_owner = Address::generate(&env);
    let admin     = Address::generate(&env);

    client.transfer_ownership(&owner, &new_owner).unwrap();
    client.assign_admin(&new_owner, &admin).expect("new owner grant must succeed");

    assert!(client.is_admin(&admin));
}

#[test]
fn old_owner_cannot_grant_admin_after_transfer_returns_not_owner() {
    let (env, client, owner) = setup_with_owner();
    let new_owner = Address::generate(&env);
    let target    = Address::generate(&env);

    client.transfer_ownership(&owner, &new_owner).unwrap();
    let result = client.try_assign_admin(&owner, &target);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

#[test]
fn non_owner_cannot_transfer_ownership_returns_not_owner() {
    let (env, client, _owner) = setup_with_owner();
    let stranger  = Address::generate(&env);
    let new_owner = Address::generate(&env);

    let result = client.try_transfer_ownership(&stranger, &new_owner);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

#[test]
fn admin_roles_survive_ownership_transfer() {
    let (env, client, owner) = setup_with_owner();
    let admin     = Address::generate(&env);
    let new_owner = Address::generate(&env);

    client.assign_admin(&owner, &admin).unwrap();
    client.transfer_ownership(&owner, &new_owner).unwrap();

    assert!(client.is_admin(&admin));
    assert!(client.can_moderate(&admin));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 – resolve() role guard
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn owner_can_resolve_report() {
    let (env, client, owner) = setup_with_owner();
    let id = make_reported_confession(&client, &env);
    client.resolve(&owner, &id).expect("owner resolve must succeed");
}

#[test]
fn admin_can_resolve_report() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);
    client.assign_admin(&owner, &admin).unwrap();

    let id = make_reported_confession(&client, &env);
    client.resolve(&admin, &id).expect("admin resolve must succeed");
}

#[test]
fn stranger_cannot_resolve_returns_not_authorized() {
    let (env, client, _owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    let id = make_reported_confession(&client, &env);

    let result = client.try_resolve(&stranger, &id);
    assert_eq!(result, Err(Ok(AccessError::NotAuthorized)));
}

/// Acceptance criterion: error code is deterministic (2 == NotAuthorized).
#[test]
fn unauthorized_resolve_error_code_is_2() {
    let (env, client, _owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    let id = make_reported_confession(&client, &env);

    let result = client.try_resolve(&stranger, &id);
    match result {
        Err(Ok(err)) => assert_eq!(err as u32, 2, "NotAuthorized must have code 2"),
        other => panic!("expected Err(Ok(AccessError)), got {:?}", other),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 – update_config() guard
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn owner_can_update_config() {
    let (env, client, owner) = setup_with_owner();
    client.update_config(&owner, &512, &128).expect("owner update_config must succeed");
}

#[test]
fn admin_cannot_update_config_returns_not_owner() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);
    client.assign_admin(&owner, &admin).unwrap();

    let result = client.try_update_config(&admin, &512, &128);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

#[test]
fn stranger_cannot_update_config_returns_not_owner() {
    let (env, client, _owner) = setup_with_owner();
    let stranger = Address::generate(&env);

    let result = client.try_update_config(&stranger, &512, &128);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

#[test]
fn update_config_with_zero_content_len_is_rejected() {
    let (env, client, owner) = setup_with_owner();
    let result = client.try_update_config(&owner, &0, &128);
    assert!(result.is_err(), "zero max_content_len must be rejected");
}

#[test]
fn config_change_is_observed_by_create() {
    let (env, client, owner) = setup_with_owner();
    client.update_config(&owner, &5, &256).unwrap();

    // 5-char content — must succeed
    client.create(&s(&env, "Hello")).expect("5-char content must succeed");

    // 6-char content — must be rejected
    let result = client.try_create(&s(&env, "Hello!"));
    assert!(result.is_err(), "content exceeding new max_content_len must be rejected");
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 – assign/revoke guards (comprehensive non-owner rejections)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn stranger_cannot_transfer_ownership_returns_not_owner() {
    let (env, client, _owner) = setup_with_owner();
    let stranger  = Address::generate(&env);
    let new_owner = Address::generate(&env);

    let result = client.try_transfer_ownership(&stranger, &new_owner);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

#[test]
fn admin_cannot_transfer_ownership_returns_not_owner() {
    let (env, client, owner) = setup_with_owner();
    let admin     = Address::generate(&env);
    let new_owner = Address::generate(&env);

    client.assign_admin(&owner, &admin).unwrap();

    let result = client.try_transfer_ownership(&admin, &new_owner);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

#[test]
fn admin_cannot_revoke_other_admin_returns_not_owner() {
    let (env, client, owner) = setup_with_owner();
    let admin_a = Address::generate(&env);
    let admin_b = Address::generate(&env);

    client.assign_admin(&owner, &admin_a).unwrap();
    client.assign_admin(&owner, &admin_b).unwrap();

    let result = client.try_revoke_admin(&admin_a, &admin_b);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8 – View methods
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn is_owner_returns_false_for_random_address() {
    let (env, client, _owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    assert!(!client.is_owner(&stranger));
}

#[test]
fn is_admin_returns_false_before_grant() {
    let (env, client, _owner) = setup_with_owner();
    let candidate = Address::generate(&env);
    assert!(!client.is_admin(&candidate));
}

#[test]
fn can_moderate_returns_false_for_stranger() {
    let (env, client, _owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    assert!(!client.can_moderate(&stranger));
}

#[test]
fn can_moderate_returns_true_for_owner_and_admin() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);
    client.assign_admin(&owner, &admin).unwrap();

    assert!(client.can_moderate(&owner));
    assert!(client.can_moderate(&admin));
}

#[test]
fn get_owner_reflects_current_owner() {
    let (env, client, owner) = setup_with_owner();
    assert_eq!(client.get_owner(), owner);

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&owner, &new_owner).unwrap();
    assert_eq!(client.get_owner(), new_owner);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 9 – Error code contract (discriminant stability)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn error_discriminants_are_stable() {
    assert_eq!(AccessError::NotOwner            as u32, 1);
    assert_eq!(AccessError::NotAuthorized       as u32, 2);
    assert_eq!(AccessError::AlreadyAdmin        as u32, 3);
    assert_eq!(AccessError::NotAdmin            as u32, 4);
    assert_eq!(AccessError::AlreadyInitialized  as u32, 5);
    assert_eq!(AccessError::CannotDemoteOwner   as u32, 6);
    assert_eq!(AccessError::SameOwner           as u32, 7);
    assert_eq!(AccessError::MinimumAdminRequired as u32, 8);
}

#[test]
fn not_owner_code_is_1() {
    let (env, client, _owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    let target   = Address::generate(&env);

    let result = client.try_assign_admin(&stranger, &target);
    assert_eq!(result, Err(Ok(AccessError::NotOwner)));
    assert_eq!(AccessError::NotOwner as u32, 1);
}

#[test]
fn not_authorized_code_is_2() {
    let (env, client, _owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    let id = make_reported_confession(&client, &env);

    let result = client.try_resolve(&stranger, &id);
    assert_eq!(result, Err(Ok(AccessError::NotAuthorized)));
    assert_eq!(AccessError::NotAuthorized as u32, 2);
}

#[test]
fn already_admin_code_is_3() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);

    client.assign_admin(&owner, &admin).unwrap();
    let result = client.try_assign_admin(&owner, &admin);
    assert_eq!(result, Err(Ok(AccessError::AlreadyAdmin)));
    assert_eq!(AccessError::AlreadyAdmin as u32, 3);
}

#[test]
fn not_admin_code_is_4() {
    let (env, client, owner) = setup_with_owner();
    let stranger = Address::generate(&env);
    let dummy    = Address::generate(&env);
    client.assign_admin(&owner, &dummy).unwrap();

    let result = client.try_revoke_admin(&owner, &stranger);
    assert_eq!(result, Err(Ok(AccessError::NotAdmin)));
    assert_eq!(AccessError::NotAdmin as u32, 4);
}

#[test]
fn cannot_demote_owner_code_is_6() {
    let (env, client, owner) = setup_with_owner();

    let result = client.try_revoke_admin(&owner, &owner);
    assert_eq!(result, Err(Ok(AccessError::CannotDemoteOwner)));
    assert_eq!(AccessError::CannotDemoteOwner as u32, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 10 – Event emission (audit trail)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn grant_admin_emits_adm_grant_event() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);

    client.assign_admin(&owner, &admin).unwrap();

    let events = env.events().all();
    let found = events.iter().any(|(_, topics, _)| {
        topics.iter().any(|t| format!("{:?}", t).contains("adm_grant"))
    });
    assert!(found, "adm_grant event must be emitted on assign_admin()");
}

#[test]
fn revoke_admin_emits_adm_revoke_event() {
    let (env, client, owner) = setup_with_owner();
    let admin  = Address::generate(&env);
    let admin2 = Address::generate(&env);

    client.assign_admin(&owner, &admin).unwrap();
    client.assign_admin(&owner, &admin2).unwrap();
    client.revoke_admin(&owner, &admin).unwrap();

    let events = env.events().all();
    let found = events.iter().any(|(_, topics, _)| {
        topics.iter().any(|t| format!("{:?}", t).contains("adm_revoke"))
    });
    assert!(found, "adm_revoke event must be emitted on revoke_admin()");
}

#[test]
fn transfer_ownership_emits_own_xfer_event() {
    let (env, client, owner) = setup_with_owner();
    let new_owner = Address::generate(&env);

    client.transfer_ownership(&owner, &new_owner).unwrap();

    let events = env.events().all();
    let found = events.iter().any(|(_, topics, _)| {
        topics.iter().any(|t| format!("{:?}", t).contains("own_xfer"))
    });
    assert!(found, "own_xfer event must be emitted on transfer_ownership()");
}

#[test]
fn resolve_emits_resolved_event() {
    let (env, client, owner) = setup_with_owner();
    let id = make_reported_confession(&client, &env);

    client.resolve(&owner, &id).unwrap();

    let events = env.events().all();
    let found = events.iter().any(|(_, topics, _)| {
        topics.iter().any(|t| format!("{:?}", t).contains("resolved"))
    });
    assert!(found, "resolved event must be emitted on resolve()");
}

#[test]
fn no_spurious_events_on_view_calls() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);
    client.assign_admin(&owner, &admin).unwrap();

    let count_before = env.events().all().len();

    let _ = client.is_owner(&owner);
    let _ = client.is_admin(&admin);
    let _ = client.can_moderate(&owner);
    let _ = client.get_owner();

    let count_after = env.events().all().len();
    assert_eq!(count_before, count_after, "view methods must not emit events");
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 11 – Minimum-Admin Invariant
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn revoke_last_admin_returns_minimum_admin_required_and_emits_gov_inv() {
    let (env, client, owner) = setup_with_owner();
    let admin = Address::generate(&env);
    client.assign_admin(&owner, &admin).unwrap();

    // Only one admin — revoke must fail
    let result = client.try_revoke_admin(&owner, &admin);
    assert_eq!(result, Err(Ok(AccessError::MinimumAdminRequired)));

    // Admin must still be in place
    assert!(client.is_admin(&admin));

    // gov_inv event must have been emitted
    let events = env.events().all();
    let found = events.iter().any(|(_, topics, _)| {
        topics.iter().any(|t| format!("{:?}", t).contains("gov_inv"))
    });
    assert!(found, "gov_inv event must be emitted when minimum-admin invariant is violated");
}

#[test]
fn revoke_admin_when_multiple_admins_succeeds() {
    let (env, client, owner) = setup_with_owner();
    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    client.assign_admin(&owner, &admin1).unwrap();
    client.assign_admin(&owner, &admin2).unwrap();

    client.revoke_admin(&owner, &admin1).expect("revoke with 2 admins must succeed");

    assert!(!client.is_admin(&admin1));
    assert!(client.is_admin(&admin2));
    assert!(client.is_owner(&owner));
}

#[test]
fn transfer_ownership_to_same_address_returns_same_owner() {
    let (env, client, owner) = setup_with_owner();

    let result = client.try_transfer_ownership(&owner, &owner);
    assert_eq!(result, Err(Ok(AccessError::SameOwner)));
    assert_eq!(client.get_owner(), owner);
}

#[test]
fn count_admins_returns_correct_count() {
    let (env, client, owner) = setup_with_owner();

    assert_eq!(client.count_admins(), 0);

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    client.assign_admin(&owner, &admin1).unwrap();
    assert_eq!(client.count_admins(), 1);

    client.assign_admin(&owner, &admin2).unwrap();
    assert_eq!(client.count_admins(), 2);

    client.revoke_admin(&owner, &admin1).unwrap();
    assert_eq!(client.count_admins(), 1);

    assert!(!client.is_admin(&owner));
}

#[test]
fn count_authorized_includes_owner() {
    let (env, client, owner) = setup_with_owner();

    assert_eq!(client.count_authorized(), 1);

    let admin1 = Address::generate(&env);
    client.assign_admin(&owner, &admin1).unwrap();
    assert_eq!(client.count_authorized(), 2);

    let admin2 = Address::generate(&env);
    client.assign_admin(&owner, &admin2).unwrap();
    assert_eq!(client.count_authorized(), 3);

    client.revoke_admin(&owner, &admin1).unwrap();
    assert_eq!(client.count_authorized(), 2);
}
