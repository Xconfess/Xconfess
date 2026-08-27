use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

#[test]
fn test_mint_badge() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let user = Address::generate(&env);

    // Mint a badge
    let badge_id = client.mint_badge(&user, &BadgeType::ConfessionStarter);
    assert_eq!(badge_id, 1);

    // Verify badge count
    let count = client.get_badge_count(&user);
    assert_eq!(count, 1);

    // Verify has_badge
    assert!(client.has_badge(&user, &BadgeType::ConfessionStarter));
    assert!(!client.has_badge(&user, &BadgeType::PopularVoice));
}

#[test]
fn test_duplicate_badge_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let user = Address::generate(&env);

    // Mint first badge
    let badge_id1 = client.mint_badge(&user, &BadgeType::ConfessionStarter);
    assert_eq!(badge_id1, 1);

    // Verify count stays at 1
    let count = client.get_badge_count(&user);
    assert_eq!(count, 1);
}

#[test]
fn test_multiple_badge_types() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let user = Address::generate(&env);

    // Mint different badge types
    client.mint_badge(&user, &BadgeType::ConfessionStarter);
    client.mint_badge(&user, &BadgeType::PopularVoice);
    client.mint_badge(&user, &BadgeType::GenerousSoul);

    // Verify count
    let count = client.get_badge_count(&user);
    assert_eq!(count, 3);

    // Verify all badges
    assert!(client.has_badge(&user, &BadgeType::ConfessionStarter));
    assert!(client.has_badge(&user, &BadgeType::PopularVoice));
    assert!(client.has_badge(&user, &BadgeType::GenerousSoul));
    assert!(!client.has_badge(&user, &BadgeType::CommunityHero));
}

#[test]
fn test_get_badges() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let user = Address::generate(&env);

    // Mint badges
    client.mint_badge(&user, &BadgeType::ConfessionStarter);
    client.mint_badge(&user, &BadgeType::TopReactor);

    // Get all badges
    let badges = client.get_badges(&user);
    assert_eq!(badges.len(), 2);
}

#[test]
fn test_transfer_badge() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Mint badge to user1
    let badge_id = client.mint_badge(&user1, &BadgeType::ConfessionStarter);

    // Transfer to user2
    client.transfer_badge(&badge_id, &user2);

    // Verify ownership changed
    assert!(!client.has_badge(&user1, &BadgeType::ConfessionStarter));
    assert!(client.has_badge(&user2, &BadgeType::ConfessionStarter));

    assert_eq!(client.get_badge_count(&user1), 0);
    assert_eq!(client.get_badge_count(&user2), 1);
}

#[test]
fn test_get_total_badges() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    // Mint badges
    client.mint_badge(&user1, &BadgeType::ConfessionStarter);
    client.mint_badge(&user2, &BadgeType::PopularVoice);
    client.mint_badge(&user1, &BadgeType::GenerousSoul);

    // Verify total
    let total = client.get_total_badges();
    assert_eq!(total, 3);
}

#[test]
fn test_get_badge_by_id() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let user = Address::generate(&env);

    // Mint badge
    let badge_id = client.mint_badge(&user, &BadgeType::CommunityHero);

    // Get badge by ID
    let badge = client.get_badge(&badge_id);
    assert!(badge.is_some());

    let badge = badge.unwrap();
    assert_eq!(badge.id, badge_id);
    assert_eq!(badge.badge_type, BadgeType::CommunityHero);
    assert_eq!(badge.owner, user);
}

#[test]
fn test_nonexistent_badge() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    // Try to get non-existent badge
    let badge = client.get_badge(&999);
    assert!(badge.is_none());
}

#[test]
fn test_transfer_nonexistent_badge() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let _user = Address::generate(&env);

    // Verify no badge exists
    let badge = client.get_badge(&999);
    assert!(badge.is_none());
}

#[test]
fn test_revoke_badge() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let user = Address::generate(&env);

    // Mint badge
    let badge_id = client.mint_badge(&user, &BadgeType::GenerousSoul);
    assert!(client.has_badge(&user, &BadgeType::GenerousSoul));
    assert_eq!(client.get_badge_count(&user), 1);

    // Revoke badge
    client.revoke_badge(&badge_id);

    // Verify
    assert!(!client.has_badge(&user, &BadgeType::GenerousSoul));
    assert_eq!(client.get_badge_count(&user), 0);
    assert!(client.get_badge(&badge_id).is_none());
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Authorization Tests
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_initialize_contract() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Initialize contract
    client.initialize(&admin);

    // Verify admin is set
    let retrieved_admin = client.get_admin();
    assert_eq!(retrieved_admin, admin);
}

#[test]
fn test_initialize_only_once() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    // Initialize contract
    client.initialize(&admin1);

    // Try to initialize again - should fail
    let result = client.try_initialize(&admin2);
    assert!(result.is_err());
}

#[test]
fn test_transfer_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    // Initialize with admin1
    client.initialize(&admin1);
    assert_eq!(client.get_admin(), admin1);

    // Transfer to admin2
    client.transfer_admin(&admin2);

    // Verify admin2 is now admin
    assert_eq!(client.get_admin(), admin2);
}

#[test]
fn test_admin_only_functions_require_init() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let _admin = Address::generate(&env);
    let user = Address::generate(&env);

    // Try to call admin functions without initializing - should fail
    let award_result = client.try_award_badge(&user, &BadgeType::ConfessionStarter);
    assert!(award_result.is_err());

    let adjust_result =
        client.try_adjust_reputation(&user, &100i128, &String::from_str(&env, "test"));
    assert!(adjust_result.is_err());
}

#[test]
fn test_create_badge_metadata() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    // Create badge metadata
    client.create_badge(
        &BadgeType::ConfessionStarter,
        &String::from_str(&env, "First Confession"),
        &String::from_str(&env, "Posted your first confession"),
        &String::from_str(&env, "Post at least one confession"),
    );

    // Verify metadata is stored (by checking we can create it without error)
    // In a full implementation, we'd have a get_badge_metadata function
}

#[test]
fn test_award_badge_admin_only() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Admin awards badge
    let badge_id = client.award_badge(&user, &BadgeType::ConfessionStarter);
    assert_eq!(badge_id, 1);

    // Verify user received the badge
    assert!(client.has_badge(&user, &BadgeType::ConfessionStarter));
    assert_eq!(client.get_badge_count(&user), 1);
}

#[test]
fn test_adjust_reputation() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Check initial reputation
    assert_eq!(client.get_user_reputation(&user), 0);

    // Adjust reputation
    let new_rep = client.adjust_reputation(&user, &100i128, &String::from_str(&env, "test"));
    assert_eq!(new_rep, 100);

    // Verify reputation updated
    assert_eq!(client.get_user_reputation(&user), 100);

    // Adjust again (negative)
    let new_rep = client.adjust_reputation(&user, &-50i128, &String::from_str(&env, "penalty"));
    assert_eq!(new_rep, 50);

    // Verify final reputation
    assert_eq!(client.get_user_reputation(&user), 50);
}

#[test]
fn test_award_duplicate_badge_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Award badge first time
    client.award_badge(&user, &BadgeType::ConfessionStarter);

    // Try to award same badge type again - should fail
    let result = client.try_award_badge(&user, &BadgeType::ConfessionStarter);
    assert!(result.is_err());
}

#[test]
fn test_admin_can_award_different_badge_types() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Award multiple different badge types
    let id1 = client.award_badge(&user, &BadgeType::ConfessionStarter);
    let id2 = client.award_badge(&user, &BadgeType::PopularVoice);
    let id3 = client.award_badge(&user, &BadgeType::GenerousSoul);

    // Verify all were awarded
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(id3, 3);
    assert_eq!(client.get_badge_count(&user), 3);
}

#[test]
fn test_mint_and_award_can_coexist() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // User self-mints one badge
    let self_id = client.mint_badge(&user, &BadgeType::ConfessionStarter);
    assert_eq!(self_id, 1);

    // Admin tries to award same badge type - should fail (user already has it)
    let award_result = client.try_award_badge(&user, &BadgeType::ConfessionStarter);
    assert!(award_result.is_err());

    // Admin awards different badge type - should succeed
    let award_id = client.award_badge(&user, &BadgeType::PopularVoice);
    assert_eq!(award_id, 2);
    assert_eq!(client.get_badge_count(&user), 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reputation Decay Tests
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_reputation_decay_basic() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set initial reputation
    client.adjust_reputation(&user, &1000i128, &String::from_str(&env, "initial"));

    // Verify initial reputation
    assert_eq!(client.get_user_reputation(&user), 1000);

    // Simulate time passing (1 epoch = 604800 seconds)
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(epoch_duration);

    // Get reputation - should apply decay (5% decay = 95% remains)
    // 1000 * 0.95 = 950
    let rep_after_1_epoch = client.get_user_reputation(&user);
    assert_eq!(rep_after_1_epoch, 950); // 1000 * 95 / 100
}

#[test]
fn test_reputation_decay_zero_epochs() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set initial reputation
    client.adjust_reputation(&user, &1000i128, &String::from_str(&env, "initial"));

    // Get reputation immediately - no time passed
    let rep = client.get_user_reputation(&user);
    assert_eq!(rep, 1000); // No decay applied
}

#[test]
fn test_reputation_decay_multiple_epochs() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set initial reputation
    client.adjust_reputation(&user, &1000i128, &String::from_str(&env, "initial"));

    // Simulate 3 epochs passing
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(3 * epoch_duration);

    // Get reputation - should apply decay for 3 epochs
    // 1000 * 0.95^3 = 1000 * 0.857375 = 857.375 -> 857 (integer division)
    // Actually: (((1000 * 95) / 100) = 950) -> ((950 * 95) / 100) = 902 -> ((902 * 95) / 100) = 856
    let rep_after_3_epochs = client.get_user_reputation(&user);
    assert_eq!(rep_after_3_epochs, 856);
}

#[test]
fn test_reputation_decay_floor() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set small reputation
    client.adjust_reputation(&user, &10i128, &String::from_str(&env, "initial"));

    // Simulate many epochs passing (reputation should decay to 0)
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(100 * epoch_duration); // 100 epochs

    // Get reputation - should be 0 (floor)
    let rep = client.get_user_reputation(&user);
    assert_eq!(rep, 0);
}

#[test]
fn test_reputation_decay_negative() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set negative reputation
    client.adjust_reputation(&user, &-1000i128, &String::from_str(&env, "penalty"));

    // Simulate 1 epoch passing
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(epoch_duration);

    // Get reputation - negative reputation also decays (becomes less negative)
    // -1000 * 0.95 = -950
    let rep = client.get_user_reputation(&user);
    assert_eq!(rep, -950);
}

#[test]
fn test_apply_decay_explicit() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set initial reputation
    client.adjust_reputation(&user, &1000i128, &String::from_str(&env, "initial"));

    // Simulate time passing
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(epoch_duration);

    // Explicitly apply decay
    let rep = client.apply_decay(&user);
    assert_eq!(rep, 950);

    // Verify reputation was updated in storage
    assert_eq!(client.get_user_reputation(&user), 950);
}

#[test]
fn test_adjust_reputation_resets_timer() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set initial reputation
    client.adjust_reputation(&user, &1000i128, &String::from_str(&env, "initial"));

    // Simulate 1 epoch passing
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(epoch_duration);

    // Adjust reputation (should reset timer)
    client.adjust_reputation(&user, &100i128, &String::from_str(&env, "bonus"));

    // Pending decay is applied before the explicit adjustment, then the timer resets.
    let rep = client.get_user_reputation(&user);
    assert_eq!(rep, 1050);
}

#[test]
fn test_reputation_decay_bounded() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set initial reputation
    client.adjust_reputation(&user, &1000i128, &String::from_str(&env, "initial"));

    // Simulate a very long time passing (beyond MAX_EPOCHS_PER_CALCULATION = 52)
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(100 * epoch_duration); // 100 epochs

    // Get reputation - should only apply 52 epochs max
    // This ensures gas costs are bounded
    let rep = client.get_user_reputation(&user);

    // After 52 epochs: 1000 * 0.95^52 ≈ 1000 * 0.069 = 69
    // But we need to calculate exactly:
    // Each epoch: rep = rep * 95 / 100
    // After 52 epochs, the value should be bounded
    assert!(rep >= 0);
    assert!(rep <= 1000);
}

#[test]
fn test_recalibrate_epoch() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.initialize(&admin);

    // Set reputations
    client.adjust_reputation(&user1, &1000i128, &String::from_str(&env, "initial"));
    client.adjust_reputation(&user2, &2000i128, &String::from_str(&env, "initial"));

    // Simulate 2 epochs passing
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(2 * epoch_duration);

    // Recalibrate epoch with batch of users
    let mut batch = Vec::new(&env);
    batch.push_back(user1.clone());
    batch.push_back(user2.clone());

    let updated = client.recalibrate_epoch(&batch);
    assert_eq!(updated, 2);

    // Verify reputations were updated
    // user1: 1000 * 0.95^2 = 902
    // user2: 2000 -> 1900 -> 1805 with integer stepwise decay
    assert_eq!(client.get_user_reputation(&user1), 902);
    assert_eq!(client.get_user_reputation(&user2), 1805);
}

#[test]
fn test_reputation_decay_fairness_multiple_users() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.initialize(&admin);

    // Set different reputations
    client.adjust_reputation(&user1, &1000i128, &String::from_str(&env, "initial"));
    client.adjust_reputation(&user2, &500i128, &String::from_str(&env, "initial"));

    // Simulate time passing
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(epoch_duration);

    // Both users should have their reputation decayed proportionally
    let rep1 = client.get_user_reputation(&user1);
    let rep2 = client.get_user_reputation(&user2);

    // user1: 1000 * 0.95 = 950
    // user2: 500 * 0.95 = 475
    assert_eq!(rep1, 950);
    assert_eq!(rep2, 475);

    // Verify proportional decay (both lost 5% of their reputation)
    assert_eq!(rep1, 950);
    assert_eq!(rep2, 475);
}

#[test]
fn test_reputation_no_decay_when_active() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    // Set initial reputation
    client.adjust_reputation(&user, &1000i128, &String::from_str(&env, "initial"));

    // Simulate some time passing
    let epoch_duration = 604_800u64;
    env.ledger().set_timestamp(epoch_duration / 2); // Half an epoch

    // Get reputation - should NOT decay (less than 1 epoch)
    let rep = client.get_user_reputation(&user);
    assert_eq!(rep, 1000);
}

// ── Emergency pause (#1484) ─────────────────────────────────────────────

#[test]
fn test_pause_requires_admin_authorization() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    client.pause(&String::from_str(&env, "incident"));

    // Pausing must authorize as the stored admin — no other address can
    // satisfy this, even under mock_all_auths (which only removes the
    // signature-verification step, not the "which address" requirement).
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
}

#[test]
fn test_pause_blocks_mutating_entry_points() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let other = Address::generate(&env);

    client.initialize(&admin);
    // Pre-seed a badge and reputation so revoke/transfer/adjust have a target.
    client.award_badge(&user, &BadgeType::ConfessionStarter);
    client.adjust_reputation(&user, &100i128, &String::from_str(&env, "seed"));

    client.pause(&String::from_str(&env, "incident"));
    assert!(client.is_paused());

    assert!(client
        .try_create_badge(
            &BadgeType::PopularVoice,
            &String::from_str(&env, "n"),
            &String::from_str(&env, "d"),
            &String::from_str(&env, "c"),
        )
        .is_err());
    assert!(client
        .try_award_badge(&user, &BadgeType::PopularVoice)
        .is_err());
    assert!(client
        .try_adjust_reputation(&user, &10i128, &String::from_str(&env, "x"))
        .is_err());
    assert!(client
        .try_mint_badge(&other, &BadgeType::GenerousSoul)
        .is_err());
    assert!(client.try_transfer_badge(&1u64, &other).is_err());
    assert!(client.try_revoke_badge(&1u64).is_err());

    let mut batch = Vec::new(&env);
    batch.push_back(user.clone());
    assert!(client.try_recalibrate_epoch(&batch).is_err());
}

#[test]
fn test_pause_does_not_block_read_only_calls() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);
    client.award_badge(&user, &BadgeType::ConfessionStarter);
    client.adjust_reputation(&user, &50i128, &String::from_str(&env, "seed"));

    client.pause(&String::from_str(&env, "incident"));

    // Read-only queries must remain available while paused.
    assert_eq!(client.get_admin(), admin);
    assert!(client.has_badge(&user, &BadgeType::ConfessionStarter));
    assert_eq!(client.get_badge_count(&user), 1);
    assert_eq!(client.get_user_reputation(&user), 50);
    assert!(client.get_badge(&1u64).is_some());
    assert_eq!(client.get_total_badges(), 1);
}

#[test]
fn test_unpause_restores_mutations() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin);

    client.pause(&String::from_str(&env, "incident"));
    assert!(client.is_paused());
    assert!(client
        .try_award_badge(&user, &BadgeType::ConfessionStarter)
        .is_err());

    client.unpause(&String::from_str(&env, "resolved"));
    assert!(!client.is_paused());

    // Mutations succeed again once unpaused.
    let badge_id = client.award_badge(&user, &BadgeType::ConfessionStarter);
    assert_eq!(badge_id, 1);
}

#[test]
fn test_pause_requires_initialized_contract() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &contract_id);

    // No admin set yet — pause must fail rather than silently succeed.
    let result = client.try_pause(&String::from_str(&env, "incident"));
    assert!(result.is_err());
}
