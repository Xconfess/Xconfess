//! Migration tests for the confession-registry contract.
//!
//! `confession-registry` had no explicit schema version prior to this test
//! suite; `schema_version()`/`migrate()` were added so upgrades can be
//! validated the same way as `confession-anchor` and `anonymous-tipping`.
//! SCHEMA_VERSION_CURRENT == SCHEMA_VERSION_INITIAL today (no layout change
//! yet needed) — these tests pin the *handler*, so a future schema bump that
//! forgets to add a migration arm fails loudly instead of silently.

#![cfg(test)]

extern crate std;

use confession_registry::{
    ConfessionRegistry, ConfessionRegistryClient, SCHEMA_VERSION_CURRENT, SCHEMA_VERSION_INITIAL,
};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

fn setup() -> (Env, Address, ConfessionRegistryClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, admin, client)
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    let mut b = [0u8; 32];
    b[0] = seed;
    BytesN::from_array(env, &b)
}

#[test]
fn schema_version_is_initial_before_migration() {
    let (_env, _admin, client) = setup();
    assert_eq!(client.schema_version(), SCHEMA_VERSION_INITIAL);
}

#[test]
fn migrate_bumps_schema_version_to_current() {
    let (_env, admin, client) = setup();
    let new_version = client.migrate(&admin);
    assert_eq!(new_version, SCHEMA_VERSION_CURRENT);
    assert_eq!(client.schema_version(), SCHEMA_VERSION_CURRENT);
}

#[test]
fn migrate_is_idempotent() {
    let (_env, admin, client) = setup();
    client.migrate(&admin);
    let second = client.migrate(&admin);
    assert_eq!(second, SCHEMA_VERSION_CURRENT);
}

#[test]
#[should_panic(expected = "caller must be the contract owner")]
fn migrate_requires_owner_authorization() {
    let (env, _admin, client) = setup();
    let non_owner = Address::generate(&env);
    client.migrate(&non_owner);
}

/// Pre-existing confessions and author indices must survive migration
/// byte-for-byte — migration must only ever add keys, never rewrite them.
#[test]
fn migration_preserves_pre_existing_confessions() {
    let (env, admin, client) = setup();
    let author = Address::generate(&env);

    let id1 = client.create_confession(&author, &hash(&env, 1), &1_000);
    let id2 = client.create_confession(&author, &hash(&env, 2), &2_000);

    client.migrate(&admin);

    assert_eq!(client.get_confession(&id1).id, id1);
    assert_eq!(client.get_confession(&id2).id, id2);
    assert_eq!(client.get_total_count(), 2);
    assert_eq!(client.get_author_confessions(&author).len(), 2);
}
