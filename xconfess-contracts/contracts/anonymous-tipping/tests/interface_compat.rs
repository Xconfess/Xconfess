//! Cross-contract interface compatibility tests for the anonymous-tipping
//! contract (issue #2205).
//!
//! The backend depends on three things, and each has a test group here:
//! - **Method names**: the exported function list in `abi.json` must match the
//!   surface the backend expects. Any change is an explicit interface change.
//! - **Argument and return types**: the typed client calls below pin the
//!   signatures at compile time. A signature change fails to compile here first.
//! - **Error handling**: each error the backend must classify is reachable
//!   through the `try_` client and returns the expected `Error` variant.

#![cfg(test)]

use anonymous_tipping::{
    AnonymousTipping, AnonymousTippingClient, Error, RateLimitConfig, SettlementReceipt,
    SCHEMA_VERSION_CURRENT, SCHEMA_VERSION_INITIAL,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String as SorobanString};

const ABI_JSON: &str = include_str!("../abi.json");

// ── helpers ───────────────────────────────────────────────────────────────────

/// Register and `init` the contract with its own address as the XLM token, so
/// tips update accounting without a token transfer.
fn deploy() -> (Env, Address, AnonymousTippingClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &id);
    client.init(&id);
    (env, id, client)
}

/// Deploy and claim ownership via `configure_controls`, which sets the owner
/// on first call.
fn deploy_with_owner() -> (Env, Address, Address, AnonymousTippingClient<'static>) {
    let (env, id, client) = deploy();
    let owner = Address::generate(&env);
    client.configure_controls(&owner, &1_000u32, &60u64);
    (env, id, owner, client)
}

/// Extract the `"functions"` string array from `abi.json`. Avoids a JSON
/// dependency: the array holds only plain string literals.
fn abi_functions() -> Vec<String> {
    const KEY: &str = "\"functions\": [";
    let start = ABI_JSON
        .find(KEY)
        .expect("abi.json must declare a functions array")
        + KEY.len();
    let end = start
        + ABI_JSON[start..]
            .find(']')
            .expect("functions array must close");
    ABI_JSON[start..end]
        .split(',')
        .map(|entry| entry.trim().trim_matches('"').to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

// ── ABI and method names ──────────────────────────────────────────────────────

/// The ABI lists exactly the public methods the backend integrates against.
/// Adding or removing a method requires updating this list and `abi.json`
/// together.
#[test]
fn abi_function_list_matches_backend_surface() {
    let mut actual = abi_functions();
    actual.sort();

    let mut expected = [
        "claim_receipt",
        "configure_controls",
        "get_rate_limit_config",
        "get_tip_balance",
        "get_tips",
        "global_tip_count",
        "init",
        "is_paused",
        "latest_settlement_nonce",
        "migrate",
        "pause",
        "schema_version",
        "send_tip",
        "send_tip_with_proof",
        "unpause",
        "verify_settlement",
        "xlm_token",
    ];
    expected.sort();

    assert_eq!(actual, expected);
}

/// The compatibility markers the backend checks before decoding events and
/// errors. They must stay at 1 until a breaking change bumps them.
#[test]
fn abi_compatibility_markers_are_pinned() {
    assert!(
        ABI_JSON.contains("\"event_schema_version\": 1"),
        "event_schema_version must be 1"
    );
    assert!(
        ABI_JSON.contains("\"error_registry_version\": 1"),
        "error_registry_version must be 1"
    );
}

// ── argument and return types ─────────────────────────────────────────────────

/// Each typed call pins the argument and return types the backend relies on.
#[test]
fn backend_facing_signatures_and_return_types() {
    let (env, contract_id, client) = deploy();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    assert_eq!(client.schema_version(), SCHEMA_VERSION_INITIAL);
    assert!(!client.is_paused());

    let settlement_id: u64 = client.send_tip(&sender, &recipient, &10_i128);
    let proofed_id: u64 = client.send_tip_with_proof(
        &sender,
        &recipient,
        &20_i128,
        &Some(SorobanString::from_str(&env, "proof")),
    );
    assert_eq!(settlement_id, 1);
    assert_eq!(proofed_id, 2);

    let total: i128 = client.get_tips(&recipient);
    let balance: i128 = client.get_tip_balance(&recipient);
    assert_eq!(total, 30);
    assert_eq!(balance, 30);

    let token: Address = client.xlm_token();
    assert_eq!(token, contract_id);

    let nonce: u64 = client.latest_settlement_nonce();
    assert_eq!(nonce, 2);

    let receipt: SettlementReceipt = client.claim_receipt(&settlement_id);
    assert_eq!(receipt.settlement_id, 1);
    assert_eq!(receipt.recipient, recipient);
    assert_eq!(receipt.amount, 10);

    let verified: SettlementReceipt = client.verify_settlement(&proofed_id, &recipient);
    assert_eq!(verified.settlement_id, 2);
    assert_eq!(verified.amount, 20);

    let tip_count: u64 = client.global_tip_count();
    assert_eq!(tip_count, 0, "global_tip_count is 0 before migrate()");

    let config: RateLimitConfig = client.get_rate_limit_config();
    assert_eq!(
        config,
        RateLimitConfig {
            max_tips_per_window: 1_000,
            window_seconds: 60,
        }
    );
}

/// Owner-only admin methods return the schema version and state the backend
/// reads back.
#[test]
fn owner_methods_return_expected_values() {
    let (env, _id, owner, client) = deploy_with_owner();
    let reason = SorobanString::from_str(&env, "maintenance");

    let version: u32 = client.migrate(&owner);
    assert_eq!(version, SCHEMA_VERSION_CURRENT);
    assert_eq!(client.schema_version(), SCHEMA_VERSION_CURRENT);

    client.pause(&owner, &reason);
    assert!(client.is_paused());
    client.unpause(&owner, &reason);
    assert!(!client.is_paused());
}

// ── error handling through the try_ client ────────────────────────────────────

/// Without `init`, no token is configured. Both read and write paths report it
/// as `TokenNotConfigured`, which the backend classifies as terminal.
#[test]
fn uninitialized_contract_reports_token_not_configured() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &id);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    assert_eq!(client.try_xlm_token(), Err(Ok(Error::TokenNotConfigured)));
    assert_eq!(
        client.try_send_tip(&sender, &recipient, &1),
        Err(Ok(Error::TokenNotConfigured))
    );
}

#[test]
fn paused_contract_reports_contract_paused_until_unpaused() {
    let (env, _id, owner, client) = deploy_with_owner();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let reason = SorobanString::from_str(&env, "incident");

    client.pause(&owner, &reason);
    assert_eq!(
        client.try_send_tip(&sender, &recipient, &1),
        Err(Ok(Error::ContractPaused))
    );

    client.unpause(&owner, &reason);
    assert_eq!(client.send_tip(&sender, &recipient, &1), 1);
}

#[test]
fn rate_limit_reports_rate_limited_once_window_is_full() {
    let (env, _id, owner, client) = deploy_with_owner();
    client.configure_controls(&owner, &1u32, &60u64);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    assert_eq!(client.send_tip(&sender, &recipient, &1), 1);
    assert_eq!(
        client.try_send_tip(&sender, &recipient, &1),
        Err(Ok(Error::RateLimited))
    );
    assert_eq!(client.get_tip_balance(&recipient), 1);
}

#[test]
fn zero_rate_limit_fields_report_invalid_rate_limit_config() {
    let (_env, _id, owner, client) = deploy_with_owner();

    assert_eq!(
        client.try_configure_controls(&owner, &0u32, &60u64),
        Err(Ok(Error::InvalidRateLimitConfig))
    );
    assert_eq!(
        client.try_configure_controls(&owner, &1u32, &0u64),
        Err(Ok(Error::InvalidRateLimitConfig))
    );
}

#[test]
fn non_owner_admin_calls_report_unauthorized() {
    let (env, _id, _owner, client) = deploy_with_owner();
    let intruder = Address::generate(&env);
    let reason = SorobanString::from_str(&env, "unauthorized");

    assert_eq!(
        client.try_configure_controls(&intruder, &1u32, &60u64),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_pause(&intruder, &reason),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(client.try_migrate(&intruder), Err(Ok(Error::Unauthorized)));
}

/// The metadata bound is inclusive: 128 bytes is accepted, 129 is rejected.
#[test]
fn proof_metadata_bound_is_inclusive_at_128_bytes() {
    let (env, _id, _owner, client) = deploy_with_owner();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let at_limit = "a".repeat(128);
    let over_limit = "a".repeat(129);

    assert_eq!(
        client.send_tip_with_proof(
            &sender,
            &recipient,
            &1,
            &Some(SorobanString::from_str(&env, &at_limit)),
        ),
        1
    );
    assert_eq!(
        client.try_send_tip_with_proof(
            &sender,
            &recipient,
            &1,
            &Some(SorobanString::from_str(&env, &over_limit)),
        ),
        Err(Ok(Error::MetadataTooLong))
    );
}

#[test]
fn unknown_settlement_reports_settlement_not_found() {
    let (env, _id, _owner, client) = deploy_with_owner();
    let recipient = Address::generate(&env);

    assert_eq!(
        client.try_claim_receipt(&999u64),
        Err(Ok(Error::SettlementNotFound))
    );
    assert_eq!(
        client.try_verify_settlement(&999u64, &recipient),
        Err(Ok(Error::SettlementNotFound))
    );
}

#[test]
fn verify_settlement_reports_recipient_mismatch_for_wrong_recipient() {
    let (env, _id, _owner, client) = deploy_with_owner();
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let other = Address::generate(&env);

    let settlement_id = client.send_tip(&sender, &recipient, &5);

    assert_eq!(
        client.try_verify_settlement(&settlement_id, &other),
        Err(Ok(Error::RecipientMismatch))
    );
    assert_eq!(
        client
            .verify_settlement(&settlement_id, &recipient)
            .recipient,
        recipient
    );
}
