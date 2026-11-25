//! Gas / resource regression guards.
//!
//! These tests assert that representative operations — including the largest
//! payload accepted by each per-event bound — stay within a documented CPU and
//! memory envelope. A bound that is accidentally removed or an event that
//! starts copying unbounded data will blow one of these ceilings.
//!
//! The ceilings are intentionally generous (well above today's observed
//! values) so minor SDK upgrades don't create noise; the authoritative
//! baseline is `xconfess-contracts/gas-baseline.json` maintained via
//! `docs/soroban-resource-assumptions.md`.

#![cfg(test)]

extern crate std;

use anonymous_tipping::{AnonymousTipping, AnonymousTippingClient};
use confession_anchor::{event_bounds, ConfessionAnchor, ConfessionAnchorClient};
use reputation_badges::{BadgeType, ReputationBadges, ReputationBadgesClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String as SorobanString};

/// Upper bound for a single representative operation in a debug test build.
const CPU_CEILING: u64 = 5_000_000;
const MEM_CEILING: u64 = 5_000_000;

fn string(env: &Env, len: u32) -> SorobanString {
    SorobanString::from_str(env, &"x".repeat(len as usize))
}

fn assert_within_envelope(env: &Env, label: &str) {
    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();
    std::println!("RESOURCE {label}: cpu={cpu} mem={mem}");
    assert!(
        cpu <= CPU_CEILING,
        "{label} CPU {cpu} exceeds {CPU_CEILING}"
    );
    assert!(
        mem <= MEM_CEILING,
        "{label} MEM {mem} exceeds {MEM_CEILING}"
    );
}

#[test]
fn anchor_with_max_bound_pause_reason_stays_within_budget() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &id);
    let owner = Address::generate(&env);
    client.initialize(&owner);

    env.cost_estimate().budget().reset_default();
    client.pause(&owner, &string(&env, event_bounds::MAX_PAUSE_REASON_LEN));
    assert_within_envelope(&env, "anchor_pause_max_reason");
}

#[test]
fn tipping_with_max_bound_metadata_stays_within_budget() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(AnonymousTipping, ());
    let client = AnonymousTippingClient::new(&env, &id);
    client.init(&id);
    let recipient = Address::generate(&env);

    env.cost_estimate().budget().reset_default();
    client.send_tip_with_proof(
        &Address::generate(&env),
        &recipient,
        &10,
        &Some(string(&env, event_bounds::MAX_TIPPING_PROOF_METADATA_LEN)),
    );
    assert_within_envelope(&env, "tip_max_metadata");
}

#[test]
fn badge_with_max_bound_metadata_stays_within_budget() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ReputationBadges, ());
    let client = ReputationBadgesClient::new(&env, &id);
    client.initialize(&Address::generate(&env));
    let max = event_bounds::MAX_BADGE_METADATA_LEN;

    env.cost_estimate().budget().reset_default();
    client.create_badge(
        &BadgeType::ConfessionStarter,
        &string(&env, max),
        &string(&env, max),
        &string(&env, max),
    );
    assert_within_envelope(&env, "badge_max_metadata");
}

#[test]
fn rejected_oversized_payload_does_not_amplify_resource_usage() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &id);
    let owner = Address::generate(&env);
    client.initialize(&owner);

    // A grossly oversized reason is rejected before any event is serialised.
    // Bounded rejection must complete without exhausting the default budget.
    env.cost_estimate().budget().reset_default();
    let result = client.try_pause(
        &owner,
        &string(&env, event_bounds::MAX_PAUSE_REASON_LEN * 4),
    );
    assert!(result.is_err());
    assert_within_envelope(&env, "anchor_oversized_reason_rejected");
    assert!(!client.is_paused());
}

// ── worst-case pagination / batch envelopes ──────────────────────────────────

#[test]
fn batch_anchoring_of_bounded_events_stays_within_budget() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &id);

    env.cost_estimate().budget().reset_default();
    for i in 0..16_u8 {
        let hash = soroban_sdk::BytesN::from_array(&env, &[i; 32]);
        client.anchor_confession(&hash, &(i as u64));
    }
    assert_within_envelope(&env, "anchor_batch_16");
    assert_eq!(client.get_confession_count(), 16);
}
