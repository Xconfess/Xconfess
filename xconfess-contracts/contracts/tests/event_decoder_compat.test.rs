//! Event decoder compatibility tests.
//! Version bump workflow: `docs/contract-event-version-bump-checklist.md`

use soroban_sdk::{Env, testutils::Address as _};
use xconfess_contract::events::*;
use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};

#[test]
fn event_contains_version() {
    let env = Env::default();
    let addr = soroban_sdk::Address::generate(&env);

    let event = ConfessionEvent {
        event_version: EVENT_VERSION_V1,
        confession_id: 1,
        author: addr,
        content_hash: soroban_sdk::symbol_short!("hash"),
        nonce: 1,
        timestamp: 0,
        correlation_id: None,
    };

    assert_eq!(event.event_version, 1);
    assert_eq!(event.nonce, 1);
}

#[test]
fn anchor_event_contains_explicit_version_marker() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);

    let hash = soroban_sdk::BytesN::from_array(&env, &[7u8; 32]);
    let ts: u64 = 123;

    client.anchor_confession(&hash, &ts);

    let events = env.events().all();
    assert_eq!(events.len(), 1, "anchor should emit exactly one event");

    let (_cid, _topics, data) = events.first().unwrap();
    let decoded: (u32, u64, u32) = data.into_val(&env);

    assert_eq!(decoded.0, 1, "schema discriminator must be stable");
    assert_eq!(decoded.1, ts);
}

#[test]
fn schema_drift_guard() {
    let expected = [
        (
            "anchor",
            "ConfessionAnchoredEvent",
            "confession_anchor",
            &["event_version", "timestamp", "anchor_height"][..],
        ),
        (
            "anchor",
            "VersionCompatibilityCheckedEvent",
            "version_compatibility_checked",
            &[
                "event_version",
                "nonce",
                "timestamp",
                "from_major",
                "from_minor",
                "from_patch",
                "to_major",
                "to_minor",
                "to_patch",
                "compatible",
            ][..],
        ),
        (
            "tip",
            "SettlementEvent",
            "tip_settl",
            &[
                "recipient",
                "event_version",
                "settlement_id",
                "amount",
                "proof_metadata",
                "proof_present",
                "timestamp",
            ][..],
        ),
        (
            "confession",
            "ConfessionEvent",
            "confess",
            &[
                "event_version",
                "confession_id",
                "author",
                "content_hash",
                "nonce",
                "timestamp",
                "correlation_id",
            ][..],
        ),
        (
            "reaction",
            "ReactionEvent",
            "react",
            &[
                "event_version",
                "confession_id",
                "reactor",
                "reaction_type",
                "nonce",
                "timestamp",
                "correlation_id",
            ][..],
        ),
        (
            "pause",
            "PauseChangedEvent",
            "tip_pause",
            &["actor", "paused", "reason", "timestamp"][..],
        ),
        (
            "report",
            "ReportEvent",
            "report",
            &[
                "event_version",
                "confession_id",
                "reporter",
                "reason",
                "nonce",
                "timestamp",
                "correlation_id",
            ][..],
        ),
        (
            "report",
            "ReportSubmittedLedgerEvent",
            "report",
            &[
                "confession_id",
                "actor",
                "reason",
                "event_version",
                "nonce",
                "timestamp",
            ][..],
        ),
        (
            "role",
            "RoleEvent",
            "role",
            &[
                "event_version",
                "user",
                "role",
                "granted",
                "nonce",
                "timestamp",
                "correlation_id",
            ][..],
        ),
        (
            "governance",
            "GovernanceEvent",
            "<stream>",
            &["event_version", "metadata", "nonce", "timestamp"][..],
        ),
        (
            "governance",
            "GovernanceProposedEvent",
            "gov_prop",
            &["proposal_id", "proposer"][..],
        ),
        (
            "governance",
            "GovernanceApprovedEvent",
            "gov_app",
            &["proposal_id", "approver"][..],
        ),
        (
            "governance",
            "GovernanceApprovalRevokedEvent",
            "gov_rev",
            &["proposal_id", "actor"][..],
        ),
        (
            "governance",
            "GovernanceExecutedEvent",
            "gov_exec",
            &["proposal_id", "executor"][..],
        ),
        (
            "governance",
            "GovInvariantViolationEvent",
            "gov_inv",
            &["nonce", "timestamp", "operation", "reason", "attempted_by"][..],
        ),
        (
            "reputation",
            "BadgeEvent",
            "badge",
            &[
                "event_version",
                "badge_id",
                "badge_type",
                "owner",
                "action",
                "nonce",
                "timestamp",
            ][..],
        ),
        (
            "reputation",
            "BadgeEvent",
            "badge_awarded",
            &[
                "event_version",
                "badge_id",
                "badge_type",
                "owner",
                "action",
                "timestamp",
            ][..],
        ),
        (
            "reputation",
            "BadgeEvent",
            "badge_granted",
            &[
                "event_version",
                "badge_id",
                "badge_type",
                "owner",
                "action",
                "timestamp",
            ][..],
        ),
        (
            "reputation",
            "BadgeEvent",
            "badge_revoked",
            &[
                "event_version",
                "badge_id",
                "badge_type",
                "owner",
                "action",
                "timestamp",
            ][..],
        ),
        (
            "reputation",
            "ReputationAdjustedData",
            "reputation_adjusted",
            &["user", "amount", "reason", "timestamp"][..],
        ),
        (
            "reputation",
            "ReputationDecayedData",
            "reputation_decayed",
            &[
                "user",
                "old_reputation",
                "new_reputation",
                "epochs_applied",
                "timestamp",
            ][..],
        ),
    ];

    assert_eq!(
        PUBLIC_EVENT_SCHEMA_FIXTURES.len(),
        expected.len(),
        "every public fixture must be listed exactly once"
    );

    for (idx, (category, event_name, topic, field_order)) in expected.iter().enumerate() {
        let fixture = &PUBLIC_EVENT_SCHEMA_FIXTURES[idx];
        assert_eq!(fixture.fixture_version, EVENT_FIXTURE_VERSION_V1);
        assert_eq!(&fixture.category, category);
        assert_eq!(&fixture.event_name, event_name);
        assert_eq!(&fixture.topic, topic);
        assert_eq!(fixture.event_version, EVENT_VERSION_V1);
        assert_eq!(fixture.field_order, *field_order);
        assert_eq!(decode_event_fixture_schema(fixture).unwrap(), *fixture);
    }
}

#[test]
fn public_event_fixture_categories_are_complete() {
    for category in [
        "anchor",
        "tip",
        "confession",
        "reaction",
        "report",
        "pause",
        "role",
        "governance",
        "reputation",
    ] {
        assert!(
            PUBLIC_EVENT_SCHEMA_FIXTURES
                .iter()
                .any(|fixture| fixture.category == category),
            "missing public event fixtures for category: {}",
            category
        );
    }
}

#[test]
fn fixture_decoder_rejects_unsupported_event_versions() {
    let mut fixture = PUBLIC_EVENT_SCHEMA_FIXTURES[0];
    fixture.event_version = EVENT_VERSION_V1 + 1;

    assert_eq!(
        decode_event_fixture_schema(&fixture),
        Err(EventDecodeError::UnsupportedEventVersion(EVENT_VERSION_V1 + 1))
    );
}
