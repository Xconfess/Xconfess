//! Migration tests for the reputation-badges contract.
//!
//! `reputation-badges` had no explicit schema version prior to this test
//! suite; `schema_version()`/`migrate()` were added so upgrades can be
//! validated the same way as `confession-anchor` and `anonymous-tipping`.
//! SCHEMA_VERSION_CURRENT == SCHEMA_VERSION_INITIAL today (no layout change
//! yet needed) — these tests pin the *handler*, so a future schema bump that
//! forgets to add a migration arm fails loudly instead of silently.

#![cfg(test)]

extern crate std;

use reputation_badges::{
    BadgeType, ReputationBadges, ReputationBadgesClient, SCHEMA_VERSION_CURRENT,
    SCHEMA_VERSION_INITIAL,
};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address, ReputationBadgesClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, admin, client)
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
fn migrate_requires_admin_authorization() {
    use reputation_badges::Error;
    let (env, _admin, client) = setup();
    let non_admin = Address::generate(&env);

    let result = client.try_migrate(&non_admin);
    assert_eq!(result, Err(Ok(Error::NotAuthorized)));
}

/// Pre-existing badges and reputation must survive migration byte-for-byte —
/// migration must only ever add keys, never rewrite them.
#[test]
fn migration_preserves_pre_existing_badges_and_reputation() {
    let (env, admin, client) = setup();
    let user = Address::generate(&env);
    let reason = soroban_sdk::String::from_str(&env, "good confession");

    let badge_id = client.mint_badge(&user, &BadgeType::ConfessionStarter);
    client.adjust_reputation(&user, &42i128, &reason);

    client.migrate(&admin);

    assert_eq!(client.get_badge(&badge_id).unwrap().owner, user);
    assert_eq!(client.get_user_reputation(&user), 42i128);
}
