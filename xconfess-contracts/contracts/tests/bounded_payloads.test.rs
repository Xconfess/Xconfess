use soroban_sdk::{Env, String as SorobanString};
use xconfess_contract::pagination::confession::{create, MAX_CONFESSION_CONTENT_LEN};
use anonymous_tipping::AnonymousTipping;
use soroban_sdk::testutils::Address as _;
use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use confession_registry::{
    ConfessionRegistry, ConfessionRegistryClient, MAX_AUTHOR_CONFESSIONS_PER_AUTHOR,
};

#[test]
fn confession_content_exact_limit_succeeds() {
    let env = Env::default();
    let content = SorobanString::from_str(
        &env,
        &"a".repeat(MAX_CONFESSION_CONTENT_LEN as usize),
    );

    let id = create(&env, content);
    assert_eq!(id, 1);
}

#[test]
#[should_panic(expected = "confession content too long")]
fn confession_content_limit_plus_one_rejected() {
    let env = Env::default();
    let content = SorobanString::from_str(
        &env,
        &"a".repeat((MAX_CONFESSION_CONTENT_LEN + 1) as usize),
    );

    let _ = create(&env, content);
}

#[test]
fn settlement_proof_metadata_exact_limit_succeeds() {
    let env = Env::default();
    let recipient = soroban_sdk::Address::generate(&env);
    AnonymousTipping::init(env.clone());

    let metadata = SorobanString::from_str(
        &env,
        &"p".repeat(AnonymousTipping::MAX_PROOF_METADATA_LEN as usize),
    );
    let settlement_id = AnonymousTipping::send_tip_with_proof(
        env.clone(),
        recipient.clone(),
        10,
        Some(metadata),
    );

    assert_eq!(settlement_id, 1);
    assert_eq!(AnonymousTipping::get_tips(env, recipient), 10);
}

#[test]
#[should_panic(expected = "proof metadata too long")]
fn settlement_proof_metadata_limit_plus_one_rejected() {
    let env = Env::default();
    let recipient = soroban_sdk::Address::generate(&env);
    AnonymousTipping::init(env.clone());

    let metadata = SorobanString::from_str(
        &env,
        &"p".repeat((AnonymousTipping::MAX_PROOF_METADATA_LEN + 1) as usize),
    );

    let _ = AnonymousTipping::send_tip_with_proof(env, recipient, 10, Some(metadata));
}

#[test]
fn anchor_pause_reason_exact_limit_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);
    let owner = soroban_sdk::Address::generate(&env);
    let reason = SorobanString::from_str(&env, &"r".repeat(128));

    client.initialize(&owner);

    client.pause(&owner, &reason);
}

#[test]
#[should_panic(expected = "pause reason too long")]
fn anchor_pause_reason_limit_plus_one_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);
    let owner = soroban_sdk::Address::generate(&env);
    let reason = SorobanString::from_str(&env, &"r".repeat(129));

    client.initialize(&owner);

    let _ = client.pause(&owner, &reason);
}

#[test]
fn registry_author_index_exact_limit_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &contract_id);
    let admin = soroban_sdk::Address::generate(&env);
    let author = soroban_sdk::Address::generate(&env);

    client.initialize(&admin);

    for seed in 0..MAX_AUTHOR_CONFESSIONS_PER_AUTHOR {
        let mut bytes = [0u8; 32];
        bytes[0] = seed as u8;
        let hash = soroban_sdk::BytesN::from_array(&env, &bytes);
        let id = client.create_confession(&author, &hash, &(1_000 + seed as u64));
        assert_eq!(id, seed as u64 + 1);
    }
}

#[test]
#[should_panic(expected = "registry payload too long")]
fn registry_author_index_limit_plus_one_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionRegistry, ());
    let client = ConfessionRegistryClient::new(&env, &contract_id);
    let admin = soroban_sdk::Address::generate(&env);
    let author = soroban_sdk::Address::generate(&env);

    client.initialize(&admin);

    for seed in 0..=MAX_AUTHOR_CONFESSIONS_PER_AUTHOR {
        let mut bytes = [0u8; 32];
        bytes[0] = seed as u8;
        let hash = soroban_sdk::BytesN::from_array(&env, &bytes);
        let _ = client.create_confession(&author, &hash, &(1_000 + seed as u64));
    }
}

// ── Amount boundary table ────────────────────────────────────────────────────
//
// Parametrised over (amount, should_panic). Values cover the fencepost on each
// side of the > 0 guard plus an i128 extremity.

#[test]
#[should_panic(expected = "tip amount must be positive")]
fn amount_zero_rejected() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);
    let _ = AnonymousTipping::send_tip(env, recipient, 0);
}

#[test]
#[should_panic(expected = "tip amount must be positive")]
fn amount_negative_one_rejected() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);
    let _ = AnonymousTipping::send_tip(env, recipient, -1);
}

#[test]
#[should_panic(expected = "tip amount must be positive")]
fn amount_i128_min_rejected() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);
    let _ = AnonymousTipping::send_tip(env, recipient, i128::MIN);
}

#[test]
fn amount_one_accepted() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);
    let id = AnonymousTipping::send_tip(env.clone(), recipient.clone(), 1);
    assert_eq!(id, 1);
    assert_eq!(AnonymousTipping::get_tips(env, recipient), 1);
}

#[test]
fn amount_half_i128_max_accepted() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);
    let amount = i128::MAX / 2;
    let id = AnonymousTipping::send_tip(env.clone(), recipient.clone(), amount);
    assert_eq!(id, 1);
    assert_eq!(AnonymousTipping::get_tips(env, recipient), amount);
}

// ── Metadata boundary table ───────────────────────────────────────────────────

#[test]
fn metadata_length_64_accepted() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);
    let meta = SorobanString::from_str(&env, &"x".repeat(64));
    let id = AnonymousTipping::send_tip_with_proof(env.clone(), recipient.clone(), 1, Some(meta));
    assert_eq!(id, 1);
}

#[test]
fn metadata_length_127_accepted() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);
    let meta = SorobanString::from_str(&env, &"x".repeat(127));
    let id = AnonymousTipping::send_tip_with_proof(env.clone(), recipient.clone(), 1, Some(meta));
    assert_eq!(id, 1);
}

#[test]
#[should_panic(expected = "proof metadata too long")]
fn metadata_length_256_rejected() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);
    let meta = SorobanString::from_str(&env, &"x".repeat(256));
    let _ = AnonymousTipping::send_tip_with_proof(env, recipient, 1, Some(meta));
}

// ── Duplicate settlement / accumulated totals ─────────────────────────────────
//
// Two sequential tips to the same recipient must both succeed and produce
// monotonically increasing settlement IDs while accumulating the running total.

#[test]
fn duplicate_recipient_tips_accumulate_and_id_increments() {
    let env = Env::default();
    AnonymousTipping::init(env.clone());
    let recipient = soroban_sdk::Address::generate(&env);

    let id1 = AnonymousTipping::send_tip(env.clone(), recipient.clone(), 10);
    let id2 = AnonymousTipping::send_tip(env.clone(), recipient.clone(), 20);
    let id3 = AnonymousTipping::send_tip(env.clone(), recipient.clone(), 30);

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(id3, 3);
    assert_eq!(AnonymousTipping::get_tips(env.clone(), recipient), 60);
    assert_eq!(AnonymousTipping::latest_settlement_nonce(env), 3);
}
