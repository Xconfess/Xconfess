// tests/confession_registry_auth.rs
//
// Auth and regression tests for ConfessionRegistry — issue #530.
//
// # Coverage map
//
//   Block A – delete_confession
//     A1  author can delete their own confession
//     A2  admin can delete any confession
//     A3  unauthorized caller is rejected
//     A4  deleting an already-deleted confession is rejected
//     A5  deleting a nonexistent confession is rejected
//
//   Block B – update_status
//     B1  author can update status of their own confession
//     B2  admin can update status of any confession
//     B3  unauthorized caller is rejected
//     B4  cannot update a deleted confession
//     B5  cannot update a nonexistent confession
//     B6  all valid status transitions available to author
//     B7  all valid status transitions available to admin
//
//   Block C – create_confession (paused)
//     C1  create is blocked while paused
//     C2  create succeeds after unpause
//
//   Block D – update_status (paused)
//     D1  update_status is blocked while paused
//     D2  update_status succeeds after unpause
//
//   Block E – delete_confession (paused)
//     E1  delete_confession is blocked while paused
//     E2  delete_confession succeeds after unpause
//
//   Block F – cross-cutting
//     F1  pause does not affect read-only methods
//     F2  multiple confessions from different authors are independently managed
//     F3  admin can update then delete in sequence
//     F4  updated_at is set correctly on update and delete
//     F5  author index is unchanged by status updates and deletes

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

use crate::{ConfessionRegistry, ConfessionRegistryClient, ConfessionStatus, ReplayError};

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (Env, ConfessionRegistryClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let author = Address::generate(&env);
    client.initialize(&admin);

    (env, client, admin, author)
}

/// Build a deterministic 32-byte hash from a single seed byte.
fn h(env: &Env, seed: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = seed;
    BytesN::from_array(env, &bytes)
}

/// Create a confession and return its ID.
fn create(client: &ConfessionRegistryClient, env: &Env, author: &Address, seed: u8) -> u64 {
    client.create_confession(author, &h(env, seed), &1_000_000)
}

/// Pause the contract through the governance flow.
fn pause_contract(client: &ConfessionRegistryClient, admin: &Address) {
    let id = client.gov_propose(admin, &crate::governance::model::CriticalAction::Pause);
    client.gov_approve(admin, &id);
    client.gov_execute(admin, &id);
}

/// Unpause the contract through the governance flow.
fn unpause_contract(client: &ConfessionRegistryClient, admin: &Address) {
    let id = client.gov_propose(admin, &crate::governance::model::CriticalAction::Unpause);
    client.gov_approve(admin, &id);
    client.gov_execute(admin, &id);
}

// ─── Block A – delete_confession ─────────────────────────────────────────────

/// A1: author can soft-delete their own confession.
#[test]
fn a1_author_can_delete_own_confession() {
    let (env, client, _admin, author) = setup();
    let id = create(&client, &env, &author, 1);

    client.delete_confession(&author, &id, &2_000_000);

    let conf = client.get_confession(&id);
    assert_eq!(conf.status, ConfessionStatus::Deleted);
    assert_eq!(conf.updated_at, 2_000_000);
}

/// A2: admin can soft-delete any confession, not just their own.
#[test]
fn a2_admin_can_delete_any_confession() {
    let (env, client, admin, author) = setup();
    let id = create(&client, &env, &author, 2);

    client.delete_confession(&admin, &id, &3_000_000);

    let conf = client.get_confession(&id);
    assert_eq!(conf.status, ConfessionStatus::Deleted);
}

/// A3: a third party that is neither author nor admin is rejected.
#[test]
fn a3_unauthorized_delete_is_rejected() {
    let (env, client, _admin, author) = setup();
    let outsider = Address::generate(&env);
    let id = create(&client, &env, &author, 3);

    let result = client.try_delete_confession(&outsider, &id, &2_000_000);
    assert!(
        result.is_err(),
        "unauthorized delete must return an error, not succeed"
    );
}

/// A4: deleting an already-deleted confession is rejected — prevents
///     double-delete which would reset updated_at incorrectly.
#[test]
fn a4_double_delete_is_rejected() {
    let (env, client, _admin, author) = setup();
    let id = create(&client, &env, &author, 4);

    client.delete_confession(&author, &id, &2_000_000);

    // Second delete must fail — confession is already in terminal state.
    let result = client.try_delete_confession(&author, &id, &3_000_000);
    assert!(
        result.is_err(),
        "deleting an already-deleted confession must fail"
    );
}

/// A5: deleting a nonexistent confession panics with "confession not found".
#[test]
#[should_panic(expected = "confession not found")]
fn a5_delete_nonexistent_confession_panics() {
    let (_env, client, _admin, author) = setup();
    client.delete_confession(&author, &9_999, &1_000_000);
}

// ─── Block B – update_status ──────────────────────────────────────────────────

/// B1: author can update the status of their own confession.
#[test]
fn b1_author_can_update_own_confession_status() {
    let (env, client, _admin, author) = setup();
    let id = create(&client, &env, &author, 10);

    client.update_status(&author, &id, &ConfessionStatus::Flagged, &5_000_000);

    let conf = client.get_confession(&id);
    assert_eq!(conf.status, ConfessionStatus::Flagged);
    assert_eq!(conf.updated_at, 5_000_000);
}

/// B2: admin can update the status of any confession, including those
///     belonging to another author.
#[test]
fn b2_admin_can_update_any_confession_status() {
    let (env, client, admin, author) = setup();
    let id = create(&client, &env, &author, 11);

    client.update_status(&admin, &id, &ConfessionStatus::Flagged, &6_000_000);

    let conf = client.get_confession(&id);
    assert_eq!(conf.status, ConfessionStatus::Flagged);
}

/// B3: a caller who is neither author nor admin is rejected.
#[test]
fn b3_unauthorized_update_is_rejected() {
    let (env, client, _admin, author) = setup();
    let outsider = Address::generate(&env);
    let id = create(&client, &env, &author, 12);

    let result = client.try_update_status(&outsider, &id, &ConfessionStatus::Flagged, &5_000_000);
    assert!(result.is_err(), "unauthorized update must return an error");
}

/// B4: updating a deleted confession is rejected — soft-deleted records
///     are considered immutable to prevent resurrection via status update.
#[test]
fn b4_cannot_update_deleted_confession() {
    let (env, client, _admin, author) = setup();
    let id = create(&client, &env, &author, 13);

    client.delete_confession(&author, &id, &2_000_000);

    let result = client.try_update_status(&author, &id, &ConfessionStatus::Active, &3_000_000);
    assert!(
        result.is_err(),
        "updating a deleted confession must fail — deleted is a terminal state"
    );
}

/// B5: updating a nonexistent confession panics with "confession not found".
#[test]
#[should_panic(expected = "confession not found")]
fn b5_update_nonexistent_confession_panics() {
    let (_env, client, _admin, author) = setup();
    client.update_status(&author, &9_999, &ConfessionStatus::Flagged, &1_000_000);
}

/// B6: author can exercise all non-terminal transitions on their own confession.
#[test]
fn b6_author_can_set_all_non_terminal_statuses() {
    let (env, client, _admin, author) = setup();
    let id = create(&client, &env, &author, 14);

    client.update_status(&author, &id, &ConfessionStatus::Flagged, &2_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Flagged);

    client.update_status(&author, &id, &ConfessionStatus::Active, &3_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Active);
}

/// B7: admin can transition a confession through all non-terminal statuses.
#[test]
fn b7_admin_can_set_all_non_terminal_statuses() {
    let (env, client, admin, author) = setup();
    let id = create(&client, &env, &author, 15);

    client.update_status(&admin, &id, &ConfessionStatus::Flagged, &2_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Flagged);

    client.update_status(&admin, &id, &ConfessionStatus::Active, &3_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Active);

    client.update_status(&admin, &id, &ConfessionStatus::Deleted, &4_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Deleted);
}

// ─── Block C – create_confession (paused) ────────────────────────────────────

/// C1: create_confession is blocked while the contract is paused.
#[test]
fn c1_create_blocked_while_paused() {
    let (env, client, admin, author) = setup();
    pause_contract(&client, &admin);

    let result = client.try_create_confession(&author, &h(&env, 50), &1_000_000);
    assert!(
        result.is_err(),
        "create must be blocked when contract is paused"
    );
}

/// C2: create_confession succeeds immediately after unpausing.
#[test]
fn c2_create_succeeds_after_unpause() {
    let (env, client, admin, author) = setup();
    pause_contract(&client, &admin);
    unpause_contract(&client, &admin);

    let id = client.create_confession(&author, &h(&env, 51), &1_000_000);
    assert_eq!(id, 1, "first confession after unpause must get id 1");
}

// ─── Block D – update_status (paused) ────────────────────────────────────────

/// D1: update_status is blocked while the contract is paused.
#[test]
fn d1_update_status_blocked_while_paused() {
    let (env, client, admin, author) = setup();

    // Create confession before pausing
    let id = create(&client, &env, &author, 60);

    pause_contract(&client, &admin);

    let result = client.try_update_status(&author, &id, &ConfessionStatus::Flagged, &2_000_000);
    assert!(
        result.is_err(),
        "update_status must be blocked when contract is paused"
    );
}

/// D2: update_status succeeds immediately after unpausing.
#[test]
fn d2_update_status_succeeds_after_unpause() {
    let (env, client, admin, author) = setup();
    let id = create(&client, &env, &author, 61);

    pause_contract(&client, &admin);
    unpause_contract(&client, &admin);

    client.update_status(&author, &id, &ConfessionStatus::Flagged, &3_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Flagged);
}

// ─── Block E – delete_confession (paused) ────────────────────────────────────

/// E1: delete_confession is blocked while the contract is paused.
#[test]
fn e1_delete_blocked_while_paused() {
    let (env, client, admin, author) = setup();
    let id = create(&client, &env, &author, 70);

    pause_contract(&client, &admin);

    let result = client.try_delete_confession(&author, &id, &2_000_000);
    assert!(
        result.is_err(),
        "delete_confession must be blocked when contract is paused"
    );
}

/// E2: delete_confession succeeds immediately after unpausing.
#[test]
fn e2_delete_succeeds_after_unpause() {
    let (env, client, admin, author) = setup();
    let id = create(&client, &env, &author, 71);

    pause_contract(&client, &admin);
    unpause_contract(&client, &admin);

    client.delete_confession(&author, &id, &3_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Deleted);
}

// ─── Block F – cross-cutting ──────────────────────────────────────────────────

/// F1: read-only methods (get_confession, get_by_hash, get_author_confessions,
///     get_total_count) remain accessible while the contract is paused.
#[test]
fn f1_reads_are_not_blocked_by_pause() {
    let (env, client, admin, author) = setup();
    let hash = h(&env, 80);
    let id = create(&client, &env, &author, 80);

    pause_contract(&client, &admin);

    // All reads must succeed without error
    let conf = client.get_confession(&id);
    assert_eq!(conf.id, id);

    let found = client.get_by_hash(&hash);
    assert_eq!(found, id);

    let ids = client.get_author_confessions(&author);
    assert_eq!(ids.len(), 1);

    let count = client.get_total_count();
    assert_eq!(count, 1);
}

/// F2: confessions from different authors are independently managed —
///     one author cannot modify another's confession.
#[test]
fn f2_author_isolation() {
    let (env, client, _admin, author_a) = setup();
    let author_b = Address::generate(&env);

    let id_a = create(&client, &env, &author_a, 90);
    let id_b = create(&client, &env, &author_b, 91);

    // author_b cannot update author_a's confession
    let upd = client.try_update_status(&author_b, &id_a, &ConfessionStatus::Flagged, &2_000_000);
    assert!(
        upd.is_err(),
        "author_b must not be able to update author_a's confession"
    );

    // author_a cannot delete author_b's confession
    let del = client.try_delete_confession(&author_a, &id_b, &2_000_000);
    assert!(
        del.is_err(),
        "author_a must not be able to delete author_b's confession"
    );

    // Each author's own confession remains untouched
    assert_eq!(
        client.get_confession(&id_a).status,
        ConfessionStatus::Active
    );
    assert_eq!(
        client.get_confession(&id_b).status,
        ConfessionStatus::Active
    );
}

/// F3: admin can update status and then delete in sequence.
#[test]
fn f3_admin_update_then_delete_sequence() {
    let (env, client, admin, author) = setup();
    let id = create(&client, &env, &author, 92);

    client.update_status(&admin, &id, &ConfessionStatus::Flagged, &2_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Flagged);

    client.delete_confession(&admin, &id, &3_000_000);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Deleted);
}

/// F4: updated_at is stamped correctly by both update_status and delete_confession.
#[test]
fn f4_updated_at_is_set_correctly() {
    let (env, client, _admin, author) = setup();
    let id = create(&client, &env, &author, 93);

    // updated_at starts at 0
    assert_eq!(client.get_confession(&id).updated_at, 0);

    client.update_status(&author, &id, &ConfessionStatus::Flagged, &5_555_000);
    assert_eq!(client.get_confession(&id).updated_at, 5_555_000);

    client.delete_confession(&author, &id, &6_666_000);
    assert_eq!(client.get_confession(&id).updated_at, 6_666_000);
}

/// F5: the author's confession index is unaffected by status updates and deletes.
///     The index tracks creation, not lifecycle state.
#[test]
fn f5_author_index_unchanged_by_status_changes() {
    let (env, client, _admin, author) = setup();

    let id1 = create(&client, &env, &author, 94);
    let id2 = create(&client, &env, &author, 95);

    client.update_status(&author, &id1, &ConfessionStatus::Flagged, &2_000_000);
    client.delete_confession(&author, &id2, &3_000_000);

    let ids = client.get_author_confessions(&author);
    assert_eq!(ids.len(), 2, "author index must still contain both entries");
    assert!(
        ids.iter().any(|x| x == id1),
        "id1 must remain in author index after status update"
    );
    assert!(
        ids.iter().any(|x| x == id2),
        "id2 must remain in author index after delete"
    );
}

/// G1: sequenced operations reject replayed nonce values.
#[test]
fn g1_replay_attempt_with_duplicate_nonce_is_rejected() {
    let (env, client, _admin, author) = setup();
    let id = create(&client, &env, &author, 100);

    assert_eq!(client.get_expected_nonce(&author), 1);
    assert_eq!(
        client.update_status_seq(&author, &id, &ConfessionStatus::Flagged, &2_000_000, &1),
        ()
    );
    assert_eq!(client.get_expected_nonce(&author), 2);

    let replay =
        client.try_update_status_seq(&author, &id, &ConfessionStatus::Active, &3_000_000, &1);
    assert_eq!(replay, Err(Ok(ReplayError::InvalidNonce)));
}

/// G2: stale nonce values are rejected after a successful sequenced mutation.
#[test]
fn g2_stale_nonce_is_rejected_for_delete() {
    let (env, client, _admin, author) = setup();
    let id = create(&client, &env, &author, 101);

    assert_eq!(client.get_expected_nonce(&author), 1);
    client.update_status_seq(&author, &id, &ConfessionStatus::Flagged, &2_000_000, &1);

    let stale_delete = client.try_delete_confession_seq(&author, &id, &3_000_000, &1);
    assert_eq!(stale_delete, Err(Ok(ReplayError::InvalidNonce)));

    client.delete_confession_seq(&author, &id, &4_000_000, &2);
    assert_eq!(client.get_confession(&id).status, ConfessionStatus::Deleted);
}
