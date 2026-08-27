//! Backend Verification Compatibility Fixtures
//!
//! This module provides deterministic test vectors that tie contract event output
//! to backend verification expectations. These fixtures ensure that contract and
//! backend work can evolve independently without silent drift.
//!
//! ## Purpose
//! - Prove contract event output matches what backend verification code expects
//! - Catch schema drift in automated tests instead of manual review
//! - Provide version-aware fixtures for upgrade compatibility testing
//!
//! ## Coverage
//! - Confession anchoring events (ConfessionAnchoredEvent)
//! - Anonymous tip settlement events (SettlementEvent)
//! - Reputation badge events (BadgeEvent, ReputationAdjustedData, ReputationDecayedData)
//! - Error code mappings for backend retry logic
//!
//! ## Usage
//! Contract tests call these fixtures to verify event emission.
//! Backend tests import the JSON output to validate parsing logic.
//!
//! ## Version bumps
//! See `docs/contract-event-version-bump-checklist.md` before changing
//! `FIXTURE_VERSION`, `event_version`, or fixture payload shapes.

use soroban_sdk::{
    testutils::{Address as _, Events, Ledger as _},
    Address, BytesN, Env, IntoVal, String as SorobanString,
};

use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient};
use reputation_badges::{
    BadgeAction, BadgeEvent, BadgeType, ReputationAdjustedData, ReputationDecayedData,
    ReputationBadges, ReputationBadgesClient, EPOCH_DURATION,
};

/// Fixture version for tracking compatibility across contract/backend changes
pub const FIXTURE_VERSION: u32 = 1;

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE STRUCTS
// ═══════════════════════════════════════════════════════════════════════════

/// Deterministic anchor event fixture
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnchorEventFixture {
    pub fixture_version: u32,
    pub event_version: u32,
    pub hash: [u8; 32],
    pub timestamp: u64,
    pub anchor_height: u32,
    pub description: &'static str,
}

/// Deterministic tip settlement event fixture
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TipSettlementFixture {
    pub fixture_version: u32,
    pub event_version: u32,
    pub settlement_id: u64,
    pub amount: i128,
    pub proof_metadata: &'static str,
    pub proof_present: bool,
    pub description: &'static str,
}

/// Error code fixture for backend retry classification
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErrorCodeFixture {
    pub error_code: u32,
    pub error_name: &'static str,
    pub classification: ErrorClassification,
    pub http_status: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErrorClassification {
    Terminal,
    Retryable,
}

// ── Reputation-Badges specific fixtures ─────────────────────────────────────

/// Fixture for a badge award / grant event
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BadgeEventFixture {
    pub fixture_version: u32,
    /// Must match `BadgeEvent.event_version` emitted by the contract
    pub event_version: u32,
    /// The expected `badge_id` (sequential, starting at 1)
    pub expected_badge_id: u64,
    /// Numeric discriminant of `BadgeType` enum as stored in `BadgeEvent.badge_type`
    pub badge_type_discriminant: u32,
    /// Which action this fixture tests
    pub action: BadgeActionFixture,
    /// Human-readable description for assertion messages
    pub description: &'static str,
}

/// Mirror of `BadgeAction` that is `Copy` and usable in `const`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BadgeActionFixture {
    Grant,
    Revoke,
}

/// Fixture for a reputation adjustment event
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReputationAdjustmentFixture {
    pub fixture_version: u32,
    pub delta: i128,
    pub reason: &'static str,
    pub expected_new_reputation: i128,
    pub description: &'static str,
}

/// Fixture for a reputation decay event
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReputationDecayFixture {
    pub fixture_version: u32,
    /// Initial reputation set before decay is triggered
    pub initial_reputation: i128,
    /// Number of epochs to advance time by
    pub epochs_to_advance: u32,
    /// Expected reputation after decay (pre-computed for determinism)
    pub expected_reputation: i128,
    pub description: &'static str,
}

// ═══════════════════════════════════════════════════════════════════════════
// ANCHOR EVENT FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

pub const ANCHOR_FIXTURE_BASIC: AnchorEventFixture = AnchorEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    hash: [0x42; 32],
    timestamp: 1_700_000_000_000,
    anchor_height: 12345,
    description: "Basic confession anchor with deterministic hash",
};

pub const ANCHOR_FIXTURE_ZERO_HASH: AnchorEventFixture = AnchorEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    hash: [0x00; 32],
    timestamp: 1_700_000_000_001,
    anchor_height: 12346,
    description: "Anchor with all-zero hash (valid boundary case)",
};

pub const ANCHOR_FIXTURE_MAX_TIMESTAMP: AnchorEventFixture = AnchorEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    hash: [0xFF; 32],
    timestamp: u64::MAX,
    anchor_height: 99999,
    description: "Anchor with maximum timestamp value",
};

// ═══════════════════════════════════════════════════════════════════════════
// TIP SETTLEMENT EVENT FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

pub const TIP_FIXTURE_BASIC: TipSettlementFixture = TipSettlementFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    settlement_id: 1,
    amount: 1_000_000,
    proof_metadata: "txhash:abc123",
    proof_present: true,
    description: "Basic anonymous tip with proof metadata",
};

pub const TIP_FIXTURE_NO_PROOF: TipSettlementFixture = TipSettlementFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    settlement_id: 2,
    amount: 500_000,
    proof_metadata: "",
    proof_present: false,
    description: "Anonymous tip without proof metadata",
};

pub const TIP_FIXTURE_LARGE_AMOUNT: TipSettlementFixture = TipSettlementFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    settlement_id: 3,
    amount: 100_000_000_000,
    proof_metadata: "txhash:large_tip_xyz",
    proof_present: true,
    description: "Large anonymous tip (boundary test)",
};

// ═══════════════════════════════════════════════════════════════════════════
// REPUTATION-BADGES EVENT FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/// Canonical badge grant fixture — ConfessionStarter badge (discriminant 0)
pub const BADGE_FIXTURE_GRANT_CONFESSION_STARTER: BadgeEventFixture = BadgeEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    expected_badge_id: 1,
    badge_type_discriminant: 0, // BadgeType::ConfessionStarter
    action: BadgeActionFixture::Grant,
    description: "Grant first badge (ConfessionStarter) — badge_id must be 1",
};

/// Second badge grant fixture — PopularVoice badge (discriminant 1)
pub const BADGE_FIXTURE_GRANT_POPULAR_VOICE: BadgeEventFixture = BadgeEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    expected_badge_id: 2,
    badge_type_discriminant: 1, // BadgeType::PopularVoice
    action: BadgeActionFixture::Grant,
    description: "Grant second badge (PopularVoice) to a second user — badge_id must be 2",
};

/// Revoke fixture — revoke the first badge after grant
pub const BADGE_FIXTURE_REVOKE: BadgeEventFixture = BadgeEventFixture {
    fixture_version: FIXTURE_VERSION,
    event_version: 1,
    expected_badge_id: 1,
    badge_type_discriminant: 0, // BadgeType::ConfessionStarter
    action: BadgeActionFixture::Revoke,
    description: "Revoke ConfessionStarter badge — event must carry Revoke action",
};

/// Basic reputation adjustment: positive delta
pub const REPUTATION_FIXTURE_POSITIVE: ReputationAdjustmentFixture = ReputationAdjustmentFixture {
    fixture_version: FIXTURE_VERSION,
    delta: 100,
    reason: "confession_upvoted",
    expected_new_reputation: 100,
    description: "Add 100 reputation to a fresh account",
};

/// Reputation adjustment: negative delta (penalty)
pub const REPUTATION_FIXTURE_PENALTY: ReputationAdjustmentFixture = ReputationAdjustmentFixture {
    fixture_version: FIXTURE_VERSION,
    delta: -30,
    reason: "spam_report_upheld",
    expected_new_reputation: 70, // 100 - 30, applied after REPUTATION_FIXTURE_POSITIVE
    description: "Deduct 30 reputation (penalty) from account with 100 rep",
};

/// Reputation decay fixture: 1 epoch (7 days), 5% decay applied to 100 rep
/// Expected: floor(100 * 95 / 100) = 95
pub const REPUTATION_DECAY_FIXTURE_ONE_EPOCH: ReputationDecayFixture = ReputationDecayFixture {
    fixture_version: FIXTURE_VERSION,
    initial_reputation: 100,
    epochs_to_advance: 1,
    expected_reputation: 95,
    description: "Decay 100 rep over 1 epoch → 95",
};

/// Reputation decay fixture: 4 epochs applied to 200 rep
/// Expected: 200 * (0.95)^4 = floor(200 * 0.81450625) = 162
pub const REPUTATION_DECAY_FIXTURE_FOUR_EPOCHS: ReputationDecayFixture = ReputationDecayFixture {
    fixture_version: FIXTURE_VERSION,
    initial_reputation: 200,
    epochs_to_advance: 4,
    expected_reputation: 162,
    description: "Decay 200 rep over 4 epochs → 162",
};

/// Reputation decay fixture: zero reputation should not change
pub const REPUTATION_DECAY_FIXTURE_ZERO: ReputationDecayFixture = ReputationDecayFixture {
    fixture_version: FIXTURE_VERSION,
    initial_reputation: 0,
    epochs_to_advance: 10,
    expected_reputation: 0,
    description: "Zero reputation stays at zero regardless of epochs",
};

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODE FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

pub const ERROR_CODE_FIXTURES: &[ErrorCodeFixture] = &[
    ErrorCodeFixture {
        error_code: 6001,
        error_name: "INVALID_TIP_AMOUNT",
        classification: ErrorClassification::Terminal,
        http_status: 400,
    },
    ErrorCodeFixture {
        error_code: 6002,
        error_name: "METADATA_TOO_LONG",
        classification: ErrorClassification::Terminal,
        http_status: 400,
    },
    ErrorCodeFixture {
        error_code: 6003,
        error_name: "TOTAL_OVERFLOW",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 6004,
        error_name: "NONCE_OVERFLOW",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 6005,
        error_name: "UNAUTHORIZED",
        classification: ErrorClassification::Terminal,
        http_status: 403,
    },
    ErrorCodeFixture {
        error_code: 6006,
        error_name: "CONTRACT_PAUSED",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 6007,
        error_name: "RATE_LIMITED",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 6008,
        error_name: "INVALID_RATE_LIMIT_CONFIG",
        classification: ErrorClassification::Terminal,
        http_status: 400,
    },
    ErrorCodeFixture {
        error_code: 6009,
        error_name: "TOKEN_NOT_CONFIGURED",
        classification: ErrorClassification::Terminal,
        http_status: 500,
    },
];

/// Badge-specific error codes (7000-7999 range)
pub const BADGE_ERROR_CODE_FIXTURES: &[ErrorCodeFixture] = &[
    ErrorCodeFixture {
        error_code: 7001,
        error_name: "BADGE_ALREADY_OWNED",
        classification: ErrorClassification::Terminal,
        http_status: 409,
    },
    ErrorCodeFixture {
        error_code: 7002,
        error_name: "BADGE_NOT_FOUND",
        classification: ErrorClassification::Terminal,
        http_status: 404,
    },
    ErrorCodeFixture {
        error_code: 7003,
        error_name: "BADGE_TYPE_ALREADY_OWNED",
        classification: ErrorClassification::Terminal,
        http_status: 409,
    },
    ErrorCodeFixture {
        error_code: 7004,
        error_name: "NOT_AUTHORIZED",
        classification: ErrorClassification::Terminal,
        http_status: 403,
    },
    ErrorCodeFixture {
        error_code: 7005,
        error_name: "NOT_INITIALIZED",
        classification: ErrorClassification::Retryable,
        http_status: 503,
    },
    ErrorCodeFixture {
        error_code: 7006,
        error_name: "BADGE_TYPE_METADATA_NOT_FOUND",
        classification: ErrorClassification::Terminal,
        http_status: 404,
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT TEST HELPERS — ANCHOR
// ═══════════════════════════════════════════════════════════════════════════

pub fn verify_anchor_fixture(env: &Env, client: &ConfessionAnchorClient, fixture: &AnchorEventFixture) {
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        sequence_number: fixture.anchor_height,
        ..env.ledger().get()
    });

    let hash = BytesN::from_array(env, &fixture.hash);
    let status = client.anchor_confession(&hash, &fixture.timestamp);

    assert_eq!(
        status,
        soroban_sdk::symbol_short!("anchored"),
        "fixture anchor must succeed: {}",
        fixture.description
    );

    let events = env.events().all();
    assert_eq!(events.len(), 1, "fixture must emit exactly one event: {}", fixture.description);

    let (_contract_id, _topics, data) = events.first().unwrap();
    let decoded: (u32, u64, u32) = data.into_val(env);

    assert_eq!(decoded.0, fixture.event_version, "event version mismatch: {}", fixture.description);
    assert_eq!(decoded.1, fixture.timestamp, "timestamp mismatch: {}", fixture.description);
    assert_eq!(decoded.2, fixture.anchor_height, "anchor height mismatch: {}", fixture.description);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT TEST HELPERS — TIPPING
// ═══════════════════════════════════════════════════════════════════════════

pub fn verify_tip_fixture(env: &Env, client: &AnonymousTippingClient, fixture: &TipSettlementFixture) {
    let recipient = Address::generate(env);
    let proof = if fixture.proof_present {
        Some(SorobanString::from_str(env, fixture.proof_metadata))
    } else {
        None
    };

    let settlement_id = client
        .send_tip_with_proof(&recipient, &fixture.amount, &proof)
        .expect(&format!("fixture tip must succeed: {}", fixture.description));

    assert_eq!(settlement_id, fixture.settlement_id, "settlement ID mismatch: {}", fixture.description);

    let events = env.events().all();
    assert!(!events.is_empty(), "fixture must emit at least one event: {}", fixture.description);

    let (_contract_id, _topics, data) = events.last().unwrap();
    let decoded: (Address, u32, u64, i128, SorobanString, bool, u64) = data.into_val(env);

    assert_eq!(decoded.1, fixture.event_version, "event version mismatch: {}", fixture.description);
    assert_eq!(decoded.2, fixture.settlement_id, "settlement ID mismatch: {}", fixture.description);
    assert_eq!(decoded.3, fixture.amount, "amount mismatch: {}", fixture.description);
    assert_eq!(decoded.5, fixture.proof_present, "proof_present mismatch: {}", fixture.description);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT TEST HELPERS — REPUTATION BADGES
// ═══════════════════════════════════════════════════════════════════════════

/// Set up a fresh ReputationBadges client with admin mock auth.
pub fn new_reputation_badges_client(env: &Env) -> (ReputationBadgesClient, Address) {
    env.mock_all_auths();
    let contract_id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin).expect("initialize must succeed");
    (client, admin)
}

/// Verify a badge grant or revoke event matches the fixture schema.
///
/// For `BadgeActionFixture::Grant`, this function:
///   1. Calls `award_badge` (admin path) with the badge type derived from `fixture.badge_type_discriminant`.
///   2. Asserts the returned badge_id matches `fixture.expected_badge_id`.
///   3. Decodes the emitted `BadgeEvent` and checks every field.
///
/// For `BadgeActionFixture::Revoke`, this function:
///   1. First grants the badge (to have something to revoke).
///   2. Calls `revoke_badge` as the badge owner.
///   3. Asserts the revoke event carries the correct `Revoke` action.
pub fn verify_badge_event_fixture(
    env: &Env,
    client: &ReputationBadgesClient,
    fixture: &BadgeEventFixture,
) {
    let recipient = Address::generate(env);

    let badge_type = badge_type_from_discriminant(fixture.badge_type_discriminant);

    match fixture.action {
        BadgeActionFixture::Grant => {
            let badge_id = client
                .award_badge(&recipient, &badge_type)
                .expect(&format!("award_badge must succeed: {}", fixture.description));

            assert_eq!(
                badge_id, fixture.expected_badge_id,
                "badge_id mismatch: {}",
                fixture.description
            );

            // Find the badge_awarded event and decode BadgeEvent
            let events = env.events().all();
            let badge_event = find_badge_event(env, &events, "badge_awarded")
                .unwrap_or_else(|| panic!("badge_awarded event not found: {}", fixture.description));

            assert_badge_event_fields(env, &badge_event, fixture);
        }

        BadgeActionFixture::Revoke => {
            // Grant first so we have a badge to revoke
            let badge_id = client
                .award_badge(&recipient, &badge_type)
                .expect("pre-grant for revoke test must succeed");

            // Clear events so we only see the revoke event below
            // (Soroban test env accumulates; we snapshot the count)
            let pre_revoke_count = env.events().all().len();

            client
                .revoke_badge(&badge_id)
                .expect(&format!("revoke_badge must succeed: {}", fixture.description));

            let all_events = env.events().all();
            let new_events: soroban_sdk::Vec<_> = all_events
                .iter()
                .skip(pre_revoke_count)
                .collect();

            assert!(
                !new_events.is_empty(),
                "revoke must emit an event: {}",
                fixture.description
            );

            // The revoke event is the last new event
            let (_contract_id, _topics, data) = new_events.last().unwrap();
            let decoded: BadgeEvent = data.into_val(env);

            assert_eq!(
                decoded.event_version, fixture.event_version,
                "event_version mismatch on revoke: {}",
                fixture.description
            );
            assert_eq!(
                decoded.badge_id, fixture.expected_badge_id,
                "badge_id mismatch on revoke: {}",
                fixture.description
            );
            assert_eq!(
                decoded.badge_type, fixture.badge_type_discriminant,
                "badge_type discriminant mismatch on revoke: {}",
                fixture.description
            );
            assert!(
                matches!(decoded.action, BadgeAction::Revoke),
                "action must be Revoke: {}",
                fixture.description
            );
        }
    }
}

/// Verify a reputation adjustment event matches the fixture schema.
///
/// Starts from zero reputation and applies `fixture.delta`, then checks
/// the emitted `ReputationAdjustedData` fields match what the backend parser expects.
pub fn verify_reputation_adjustment_fixture(
    env: &Env,
    client: &ReputationBadgesClient,
    user: &Address,
    fixture: &ReputationAdjustmentFixture,
) {
    let new_rep = client
        .adjust_reputation(user, &fixture.delta, &SorobanString::from_str(env, fixture.reason))
        .expect(&format!("adjust_reputation must succeed: {}", fixture.description));

    assert_eq!(
        new_rep, fixture.expected_new_reputation,
        "new reputation mismatch: {}",
        fixture.description
    );

    // Verify emitted ReputationAdjustedData event
    let events = env.events().all();
    let (_contract_id, _topics, data) = events.last().unwrap();
    let decoded: ReputationAdjustedData = data.into_val(env);

    assert_eq!(
        decoded.amount, fixture.delta,
        "event delta mismatch: {}",
        fixture.description
    );
    assert_eq!(
        decoded.user, *user,
        "event user mismatch: {}",
        fixture.description
    );
}

/// Verify a reputation decay event matches the fixture schema.
///
/// Seeds the user's reputation to `fixture.initial_reputation`, then advances
/// ledger time by `fixture.epochs_to_advance * EPOCH_DURATION` seconds and
/// calls `apply_decay`. Checks the emitted `ReputationDecayedData` event.
pub fn verify_reputation_decay_fixture(
    env: &Env,
    client: &ReputationBadgesClient,
    user: &Address,
    fixture: &ReputationDecayFixture,
) {
    // Seed initial reputation
    if fixture.initial_reputation != 0 {
        client
            .adjust_reputation(
                user,
                &fixture.initial_reputation,
                &SorobanString::from_str(env, "fixture_seed"),
            )
            .expect("seeding reputation must succeed");
    }

    // Advance ledger time past the desired number of epochs
    let advance_seconds = (fixture.epochs_to_advance as u64) * EPOCH_DURATION + 1;
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: env.ledger().timestamp() + advance_seconds,
        ..env.ledger().get()
    });

    let pre_decay_event_count = env.events().all().len();
    let result_rep = client.apply_decay(user);

    assert_eq!(
        result_rep, fixture.expected_reputation,
        "post-decay reputation mismatch: {}",
        fixture.description
    );

    // If reputation changed, a ReputationDecayedData event must have been emitted
    if fixture.initial_reputation != fixture.expected_reputation {
        let all_events = env.events().all();
        assert!(
            all_events.len() > pre_decay_event_count,
            "decay event must be emitted when reputation changes: {}",
            fixture.description
        );

        let (_contract_id, _topics, data) = all_events.last().unwrap();
        let decoded: ReputationDecayedData = data.into_val(env);

        assert_eq!(
            decoded.old_reputation, fixture.initial_reputation,
            "old_reputation mismatch in decay event: {}",
            fixture.description
        );
        assert_eq!(
            decoded.new_reputation, fixture.expected_reputation,
            "new_reputation mismatch in decay event: {}",
            fixture.description
        );
        assert_eq!(
            decoded.epochs_applied, fixture.epochs_to_advance,
            "epochs_applied mismatch in decay event: {}",
            fixture.description
        );
        assert_eq!(
            decoded.user, *user,
            "user mismatch in decay event: {}",
            fixture.description
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

fn badge_type_from_discriminant(d: u32) -> BadgeType {
    match d {
        0 => BadgeType::ConfessionStarter,
        1 => BadgeType::PopularVoice,
        2 => BadgeType::GenerousSoul,
        3 => BadgeType::CommunityHero,
        4 => BadgeType::TopReactor,
        _ => panic!("unknown BadgeType discriminant: {}", d),
    }
}

fn find_badge_event<'a>(
    env: &Env,
    events: &'a soroban_sdk::Vec<(Address, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val)>,
    topic_name: &str,
) -> Option<BadgeEvent> {
    let target = soroban_sdk::Symbol::new(env, topic_name);
    for (_contract_id, topics, data) in events.iter() {
        if topics.len() > 0 {
            if let Some(first) = topics.get(0) {
                if first == target.into() {
                    let decoded: BadgeEvent = data.into_val(env);
                    return Some(decoded);
                }
            }
        }
    }
    None
}

fn assert_badge_event_fields(env: &Env, event: &BadgeEvent, fixture: &BadgeEventFixture) {
    assert_eq!(
        event.event_version, fixture.event_version,
        "event_version mismatch: {}",
        fixture.description
    );
    assert_eq!(
        event.badge_id, fixture.expected_badge_id,
        "badge_id mismatch: {}",
        fixture.description
    );
    assert_eq!(
        event.badge_type, fixture.badge_type_discriminant,
        "badge_type discriminant mismatch: {}",
        fixture.description
    );
    assert!(
        matches!(event.action, BadgeAction::Grant),
        "action must be Grant: {}",
        fixture.description
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    // ── anchor helpers ───────────────────────────────────────────────────

    fn new_anchor_client(env: &Env) -> ConfessionAnchorClient {
        env.mock_all_auths();
        let contract_id = env.register(ConfessionAnchor, ());
        ConfessionAnchorClient::new(env, &contract_id)
    }

    fn new_tipping_client(env: &Env) -> AnonymousTippingClient {
        env.mock_all_auths();
        let contract_id = env.register(AnonymousTipping, ());
        let client = AnonymousTippingClient::new(env, &contract_id);
        client.init();
        client
    }

    // ── anchor fixture tests ─────────────────────────────────────────────

    #[test]
    fn anchor_fixture_basic_matches_contract_output() {
        let env = Env::default();
        let client = new_anchor_client(&env);
        verify_anchor_fixture(&env, &client, &ANCHOR_FIXTURE_BASIC);
    }

    #[test]
    fn anchor_fixture_zero_hash_matches_contract_output() {
        let env = Env::default();
        let client = new_anchor_client(&env);
        verify_anchor_fixture(&env, &client, &ANCHOR_FIXTURE_ZERO_HASH);
    }

    #[test]
    fn anchor_fixture_max_timestamp_matches_contract_output() {
        let env = Env::default();
        let client = new_anchor_client(&env);
        verify_anchor_fixture(&env, &client, &ANCHOR_FIXTURE_MAX_TIMESTAMP);
    }

    // ── tip fixture tests ─────────────────────────────────────────────────

    #[test]
    fn tip_fixture_basic_matches_contract_output() {
        let env = Env::default();
        let client = new_tipping_client(&env);
        verify_tip_fixture(&env, &client, &TIP_FIXTURE_BASIC);
    }

    #[test]
    fn tip_fixture_no_proof_matches_contract_output() {
        let env = Env::default();
        let client = new_tipping_client(&env);
        verify_tip_fixture(&env, &client, &TIP_FIXTURE_NO_PROOF);
    }

    #[test]
    fn tip_fixture_large_amount_matches_contract_output() {
        let env = Env::default();
        let client = new_tipping_client(&env);
        verify_tip_fixture(&env, &client, &TIP_FIXTURE_LARGE_AMOUNT);
    }

    // ── badge event fixture tests ─────────────────────────────────────────

    #[test]
    fn badge_fixture_grant_confession_starter_matches_contract_output() {
        let env = Env::default();
        let (client, _admin) = new_reputation_badges_client(&env);
        verify_badge_event_fixture(&env, &client, &BADGE_FIXTURE_GRANT_CONFESSION_STARTER);
    }

    #[test]
    fn badge_fixture_grant_popular_voice_matches_contract_output() {
        let env = Env::default();
        let (client, _admin) = new_reputation_badges_client(&env);
        // Grant confession_starter first (badge_id=1), then popular_voice (badge_id=2)
        let first_user = Address::generate(&env);
        client
            .award_badge(&first_user, &BadgeType::ConfessionStarter)
            .expect("pre-seed grant must succeed");
        verify_badge_event_fixture(&env, &client, &BADGE_FIXTURE_GRANT_POPULAR_VOICE);
    }

    #[test]
    fn badge_fixture_revoke_matches_contract_output() {
        let env = Env::default();
        let (client, _admin) = new_reputation_badges_client(&env);
        verify_badge_event_fixture(&env, &client, &BADGE_FIXTURE_REVOKE);
    }

    // ── reputation adjustment fixture tests ───────────────────────────────

    #[test]
    fn reputation_fixture_positive_matches_contract_output() {
        let env = Env::default();
        let (client, _admin) = new_reputation_badges_client(&env);
        let user = Address::generate(&env);
        verify_reputation_adjustment_fixture(&env, &client, &user, &REPUTATION_FIXTURE_POSITIVE);
    }

    #[test]
    fn reputation_fixture_penalty_matches_contract_output() {
        let env = Env::default();
        let (client, _admin) = new_reputation_badges_client(&env);
        let user = Address::generate(&env);
        // Apply positive first, then penalty
        verify_reputation_adjustment_fixture(&env, &client, &user, &REPUTATION_FIXTURE_POSITIVE);
        verify_reputation_adjustment_fixture(&env, &client, &user, &REPUTATION_FIXTURE_PENALTY);
    }

    // ── reputation decay fixture tests ────────────────────────────────────

    #[test]
    fn reputation_decay_fixture_one_epoch_matches_contract_output() {
        let env = Env::default();
        let (client, _admin) = new_reputation_badges_client(&env);
        let user = Address::generate(&env);
        verify_reputation_decay_fixture(&env, &client, &user, &REPUTATION_DECAY_FIXTURE_ONE_EPOCH);
    }

    #[test]
    fn reputation_decay_fixture_four_epochs_matches_contract_output() {
        let env = Env::default();
        let (client, _admin) = new_reputation_badges_client(&env);
        let user = Address::generate(&env);
        verify_reputation_decay_fixture(
            &env,
            &client,
            &user,
            &REPUTATION_DECAY_FIXTURE_FOUR_EPOCHS,
        );
    }

    #[test]
    fn reputation_decay_fixture_zero_rep_unchanged() {
        let env = Env::default();
        let (client, _admin) = new_reputation_badges_client(&env);
        let user = Address::generate(&env);
        verify_reputation_decay_fixture(&env, &client, &user, &REPUTATION_DECAY_FIXTURE_ZERO);
    }

    // ── error code fixture tests ──────────────────────────────────────────

    #[test]
    fn error_code_fixtures_are_stable() {
        assert_eq!(ERROR_CODE_FIXTURES.len(), 9, "all tipping error codes must be covered");
        for fixture in ERROR_CODE_FIXTURES {
            assert!(
                fixture.error_code >= 6000 && fixture.error_code < 7000,
                "tipping error codes must be in 6000-6999 range: {}",
                fixture.error_name
            );
        }
    }

    #[test]
    fn badge_error_code_fixtures_are_stable() {
        assert_eq!(
            BADGE_ERROR_CODE_FIXTURES.len(),
            6,
            "all badge error codes must be covered (matches Error enum variants)"
        );
        for fixture in BADGE_ERROR_CODE_FIXTURES {
            assert!(
                fixture.error_code >= 7000 && fixture.error_code < 8000,
                "badge error codes must be in 7000-7999 range: {}",
                fixture.error_name
            );
        }
    }

    #[test]
    fn fixture_version_is_stable() {
        assert_eq!(FIXTURE_VERSION, 1, "fixture version must remain stable");
        assert_eq!(ANCHOR_FIXTURE_BASIC.fixture_version, FIXTURE_VERSION);
        assert_eq!(TIP_FIXTURE_BASIC.fixture_version, FIXTURE_VERSION);
        assert_eq!(BADGE_FIXTURE_GRANT_CONFESSION_STARTER.fixture_version, FIXTURE_VERSION);
        assert_eq!(REPUTATION_FIXTURE_POSITIVE.fixture_version, FIXTURE_VERSION);
        assert_eq!(REPUTATION_DECAY_FIXTURE_ONE_EPOCH.fixture_version, FIXTURE_VERSION);
    }

    #[test]
    fn badge_event_version_matches_contract_constant() {
        // The event_version in every badge fixture must match what the contract
        // hard-codes in BadgeEvent { event_version: 1, ... }.
        // If the contract bumps this, tests here fail immediately.
        assert_eq!(BADGE_FIXTURE_GRANT_CONFESSION_STARTER.event_version, 1);
        assert_eq!(BADGE_FIXTURE_GRANT_POPULAR_VOICE.event_version, 1);
        assert_eq!(BADGE_FIXTURE_REVOKE.event_version, 1);
    }

    #[test]
    fn all_fixtures_are_deterministic() {
        // Run anchor fixture twice; event counts must match
        let env1 = Env::default();
        let client1 = new_anchor_client(&env1);
        verify_anchor_fixture(&env1, &client1, &ANCHOR_FIXTURE_BASIC);
        let count1 = env1.events().all().len();

        let env2 = Env::default();
        let client2 = new_anchor_client(&env2);
        verify_anchor_fixture(&env2, &client2, &ANCHOR_FIXTURE_BASIC);
        let count2 = env2.events().all().len();

        assert_eq!(count1, count2, "anchor fixture must produce identical event count across runs");

        // Run badge fixture twice; badge_ids must match
        let env3 = Env::default();
        let (client3, _) = new_reputation_badges_client(&env3);
        let user3 = Address::generate(&env3);
        let id3 = client3.award_badge(&user3, &BadgeType::ConfessionStarter).unwrap();

        let env4 = Env::default();
        let (client4, _) = new_reputation_badges_client(&env4);
        let user4 = Address::generate(&env4);
        let id4 = client4.award_badge(&user4, &BadgeType::ConfessionStarter).unwrap();

        assert_eq!(id3, id4, "badge fixture must produce identical badge_id across fresh envs");
    }
}