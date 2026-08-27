use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient};
use confession_registry::{ConfessionRegistry, ConfessionRegistryClient, ConfessionStatus};
use reputation_badges::{BadgeType, ReputationBadges, ReputationBadgesClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

const TS_CREATE: u64 = 1_710_000_000;
const TS_FLAG: u64 = 1_710_000_050;
const TIP_AMOUNT: i128 = 500;

fn fixture_hash(env: &Env, seed: u8) -> BytesN<32> {
    let mut buf = [0u8; 32];
    buf[0] = seed;
    buf[31] = seed;
    BytesN::from_array(env, &buf)
}

fn setup() -> (
    Env,
    ConfessionRegistryClient<'static>,
    ReputationBadgesClient<'static>,
    AnonymousTippingClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register(ConfessionRegistry, ());
    let badges_id = env.register(ReputationBadges, ());
    let tipping_id = env.register(AnonymousTipping, ());

    let registry = ConfessionRegistryClient::new(&env, &registry_id);
    let badges = ReputationBadgesClient::new(&env, &badges_id);
    let tipping = AnonymousTippingClient::new(&env, &tipping_id);

    let admin = Address::generate(&env);
    let author = Address::generate(&env);

    registry.initialize(&admin);
    badges.initialize(&admin);
    tipping.init(&tipping_id);

    (env, registry, badges, tipping, admin, author)
}

#[test]
fn confession_reputation_tipping_happy_path_is_repeatable() {
    let (env, registry, badges, tipping, admin, author) = setup();

    let confession_id = registry.create_confession(&author, &fixture_hash(&env, 0x21), &TS_CREATE);
    assert_eq!(confession_id, 1);

    let badge_id = badges.award_badge(&author, &BadgeType::ConfessionStarter);
    assert_eq!(badge_id, 1);
    assert!(badges.has_badge(&author, &BadgeType::ConfessionStarter));

    let new_rep = badges.adjust_reputation(
        &author,
        &100,
        &String::from_str(&env, "first confession milestone"),
    );
    assert_eq!(new_rep, 100);

    let settlement_id = tipping.send_tip(&author, &author, &TIP_AMOUNT);
    assert_eq!(settlement_id, 1);
    assert_eq!(tipping.get_tips(&author), TIP_AMOUNT);

    let confession = registry.get_confession(&confession_id);
    assert_eq!(confession.status, ConfessionStatus::Active);
    assert_eq!(registry.get_total_count(), 1);
    assert_eq!(badges.get_total_badges(), 1);
    assert_eq!(tipping.latest_settlement_nonce(), 1);

    let _ = admin;
}

#[test]
fn flagged_confession_flow_keeps_cross_contract_state_consistent() {
    let (env, registry, badges, tipping, admin, author) = setup();

    let confession_id = registry.create_confession(&author, &fixture_hash(&env, 0x41), &TS_CREATE);
    registry.update_status(&admin, &confession_id, &ConfessionStatus::Flagged, &TS_FLAG);

    let badge_id = badges.award_badge(&author, &BadgeType::PopularVoice);
    assert_eq!(badge_id, 1);

    let settlement_id = tipping.send_tip_with_proof(
        &author,
        &author,
        &TIP_AMOUNT,
        &Some(String::from_str(&env, "cross-contract moderation fixture")),
    );
    assert_eq!(settlement_id, 1);

    assert_eq!(
        registry.get_confession(&confession_id).status,
        ConfessionStatus::Flagged
    );
    assert!(badges.has_badge(&author, &BadgeType::PopularVoice));
    assert_eq!(tipping.get_tips(&author), TIP_AMOUNT);
    assert_eq!(registry.get_total_count(), 1);
    assert_eq!(badges.get_total_badges(), 1);
    assert_eq!(tipping.latest_settlement_nonce(), 1);
}
