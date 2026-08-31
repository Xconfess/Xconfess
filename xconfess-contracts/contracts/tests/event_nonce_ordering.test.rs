//! Event ordering and nonce monotonicity tests.
//!
//! Guarantees that backend consumers can rely on nonce progression being
//! monotonic — even under replay, duplicate delivery, and adversarial
//! sequencing scenarios.
//!
//! All emit_* and latest_*_nonce calls are executed inside a registered
//! contract context via env.as_contract() because the Soroban host requires
//! an active contract instance for storage and event operations.

#![cfg(test)]

extern crate std;

use confession_registry::events::{
    emit_confession, emit_reaction, emit_report, emit_role, latest_confession_nonce,
    latest_governance_nonce, latest_reaction_nonce, latest_report_nonce, latest_role_nonce,
    next_governance_nonce, ConfessionEvent,
};
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Events as _, Ledger},
    Address, Env, IntoVal, Val, Vec,
};

/// Minimal contract whose sole purpose is to give tests a stable contract ID
/// so that storage and event calls can execute within a valid contract context.
#[contract]
struct NonceTestHarness;

#[contractimpl]
impl NonceTestHarness {}

fn harness_id(env: &Env) -> Address {
    env.register(NonceTestHarness, ())
}

fn identical_timestamp_ordering() -> std::vec::Vec<(u64, u64)> {
    let env = Env::default();
    env.ledger().set_timestamp(1_725_000_000);
    let id = harness_id(&env);
    let author = Address::generate(&env);

    env.as_contract(&id, || {
        for hash in [
            symbol_short!("first"),
            symbol_short!("second"),
            symbol_short!("third"),
        ] {
            emit_confession(&env, 42, author.clone(), hash, None);
        }
    });

    env.events()
        .all()
        .iter()
        .map(|(_, _, value): (Address, Vec<Val>, Val)| {
            let event: ConfessionEvent = value.into_val(&env);
            (event.timestamp, event.nonce)
        })
        .collect()
}

#[test]
fn identical_timestamps_have_stable_nonce_ordering_across_runs() {
    let expected = std::vec![(1_725_000_000, 1), (1_725_000_000, 2), (1_725_000_000, 3),];

    for _ in 0..10 {
        assert_eq!(identical_timestamp_ordering(), expected);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic monotonicity
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn confession_nonce_increments_by_one_per_entity_stream() {
    let env = Env::default();
    let id = harness_id(&env);
    let author = Address::generate(&env);

    env.as_contract(&id, || {
        emit_confession(&env, 42, author.clone(), symbol_short!("hash_a"), None);
        emit_confession(&env, 42, author, symbol_short!("hash_b"), None);
        assert_eq!(latest_confession_nonce(&env, 42), 2);
    });
}

#[test]
fn reaction_report_and_role_nonces_are_monotonic_and_independent() {
    let env = Env::default();
    let id = harness_id(&env);
    let actor = Address::generate(&env);

    env.as_contract(&id, || {
        emit_reaction(&env, 7, actor.clone(), symbol_short!("like"), None);
        emit_reaction(&env, 7, actor.clone(), symbol_short!("love"), None);
        emit_report(&env, 7, actor.clone(), symbol_short!("spam"), None);
        emit_report(&env, 7, actor.clone(), symbol_short!("abuse"), None);
        emit_role(&env, actor.clone(), symbol_short!("admin"), true, None);
        emit_role(&env, actor.clone(), symbol_short!("admin"), false, None);

        assert_eq!(latest_reaction_nonce(&env, 7), 2);
        assert_eq!(latest_report_nonce(&env, 7), 2);
        assert_eq!(latest_role_nonce(&env, actor, symbol_short!("admin")), 2);
    });
}

#[test]
fn governance_nonce_is_monotonic_per_stream_symbol() {
    let env = Env::default();
    let id = harness_id(&env);

    env.as_contract(&id, || {
        let stream = symbol_short!("gov_acc");
        assert_eq!(latest_governance_nonce(&env, stream.clone()), 0);
        assert_eq!(next_governance_nonce(&env, stream.clone()), 1);
        assert_eq!(next_governance_nonce(&env, stream.clone()), 2);
        assert_eq!(latest_governance_nonce(&env, stream), 2);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap / duplicate / out-of-order detection (consumer-side simulation)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn nonce_sequence_supports_gap_duplicate_and_order_checks() {
    // Simulated ingestion stream from an indexer consumer; no contract context
    // needed because this is pure arithmetic over an observed sequence.
    let observed = [1_u64, 2, 2, 4, 3, 5];

    let mut expected_next = 1_u64;
    let mut gaps = 0_u64;
    let mut duplicates = 0_u64;
    let mut out_of_order = 0_u64;

    for nonce in observed {
        if nonce == expected_next {
            expected_next += 1;
        } else if nonce < expected_next {
            if nonce + 1 == expected_next {
                duplicates += 1;
            } else {
                out_of_order += 1;
            }
        } else {
            gaps += nonce - expected_next;
            expected_next = nonce + 1;
        }
    }

    assert_eq!(gaps, 1); // missing nonce 3 before 4
    assert_eq!(duplicates, 1); // duplicate nonce 2
    assert_eq!(out_of_order, 1); // late arrival nonce 3 after 4
}

// ─────────────────────────────────────────────────────────────────────────────
// Replay scenarios
// ─────────────────────────────────────────────────────────────────────────────

/// Emitting the same event twice (replay) must still advance the nonce; the
/// on-chain counter is the authoritative monotonic source, not the content.
#[test]
fn replay_of_same_confession_advances_nonce() {
    let env = Env::default();
    let id = harness_id(&env);
    let author = Address::generate(&env);

    env.as_contract(&id, || {
        emit_confession(&env, 100, author.clone(), symbol_short!("hashX"), None);
        assert_eq!(latest_confession_nonce(&env, 100), 1);

        // Replayed emission with identical arguments.
        emit_confession(&env, 100, author.clone(), symbol_short!("hashX"), None);
        assert_eq!(
            latest_confession_nonce(&env, 100),
            2,
            "nonce must advance on replay — consumers must not deduplicate by content alone"
        );
    });
}

/// Replaying a reaction event on the same confession does not reset or
/// stall the nonce counter.
#[test]
fn replay_of_reaction_event_preserves_monotonicity() {
    let env = Env::default();
    let id = harness_id(&env);
    let reactor = Address::generate(&env);

    env.as_contract(&id, || {
        for _ in 0..5 {
            emit_reaction(&env, 55, reactor.clone(), symbol_short!("like"), None);
        }
        assert_eq!(
            latest_reaction_nonce(&env, 55),
            5,
            "five replayed reaction events must yield nonce 5"
        );
    });
}

/// A mixed sequence of replayed and fresh events on the same stream must
/// still yield a strictly increasing nonce sequence.
#[test]
fn mixed_replay_and_fresh_events_remain_strictly_increasing() {
    let env = Env::default();
    let id = harness_id(&env);
    let actor = Address::generate(&env);
    let confession_id = 77_u64;

    env.as_contract(&id, || {
        let mut expected = 0_u64;
        for i in 0..6_u32 {
            let hash = if i % 2 == 0 {
                symbol_short!("even")
            } else {
                symbol_short!("odd")
            };
            emit_confession(&env, confession_id, actor.clone(), hash, None);
            expected += 1;
            assert_eq!(
                latest_confession_nonce(&env, confession_id),
                expected,
                "nonce must be {} after {} emissions",
                expected,
                i + 1
            );
        }
    });
}

/// Events on distinct entity IDs maintain independent nonce counters.
/// A replay on stream A must not affect stream B.
#[test]
fn nonce_streams_are_isolated_by_entity_id() {
    let env = Env::default();
    let id = harness_id(&env);
    let actor = Address::generate(&env);

    env.as_contract(&id, || {
        emit_confession(&env, 1, actor.clone(), symbol_short!("a"), None);
        emit_confession(&env, 1, actor.clone(), symbol_short!("b"), None);
        emit_confession(&env, 2, actor.clone(), symbol_short!("c"), None);

        assert_eq!(
            latest_confession_nonce(&env, 1),
            2,
            "stream 1 must be at nonce 2"
        );
        assert_eq!(
            latest_confession_nonce(&env, 2),
            1,
            "stream 2 must be at nonce 1"
        );
        assert_eq!(
            latest_confession_nonce(&env, 3),
            0,
            "unused stream 3 must be 0"
        );
    });
}

/// Governance nonces across distinct stream symbols must never cross-affect.
#[test]
fn governance_nonce_streams_are_independent() {
    let env = Env::default();
    let id = harness_id(&env);
    let stream_a = symbol_short!("stream_a");
    let stream_b = symbol_short!("stream_b");

    env.as_contract(&id, || {
        next_governance_nonce(&env, stream_a.clone());
        next_governance_nonce(&env, stream_a.clone());
        next_governance_nonce(&env, stream_b.clone());

        assert_eq!(latest_governance_nonce(&env, stream_a), 2);
        assert_eq!(latest_governance_nonce(&env, stream_b), 1);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Boundary nonce values
// ─────────────────────────────────────────────────────────────────────────────

/// Starting from zero, a single event must produce nonce 1 — never 0.
#[test]
fn first_event_always_produces_nonce_one() {
    let env = Env::default();
    let id = harness_id(&env);
    let actor = Address::generate(&env);

    env.as_contract(&id, || {
        emit_confession(&env, 200, actor.clone(), symbol_short!("first"), None);
        assert_eq!(latest_confession_nonce(&env, 200), 1);

        emit_reaction(&env, 201, actor.clone(), symbol_short!("first"), None);
        assert_eq!(latest_reaction_nonce(&env, 201), 1);

        emit_report(&env, 202, actor.clone(), symbol_short!("first"), None);
        assert_eq!(latest_report_nonce(&env, 202), 1);
    });
}

/// Before any events are emitted, the nonce for every stream must be 0.
#[test]
fn nonce_is_zero_before_first_emission() {
    let env = Env::default();
    let id = harness_id(&env);
    let actor = Address::generate(&env);

    env.as_contract(&id, || {
        assert_eq!(latest_confession_nonce(&env, 999), 0);
        assert_eq!(latest_reaction_nonce(&env, 999), 0);
        assert_eq!(latest_report_nonce(&env, 999), 0);
        assert_eq!(latest_role_nonce(&env, actor, symbol_short!("mod")), 0);
        assert_eq!(latest_governance_nonce(&env, symbol_short!("unused")), 0);
    });
}

/// Nonces for different event types on the same entity are independent.
/// Reactions and reports on confession 42 must not share a counter.
#[test]
fn event_type_nonces_do_not_share_a_counter() {
    let env = Env::default();
    let id = harness_id(&env);
    let actor = Address::generate(&env);

    env.as_contract(&id, || {
        emit_reaction(&env, 42, actor.clone(), symbol_short!("like"), None);
        emit_reaction(&env, 42, actor.clone(), symbol_short!("love"), None);
        emit_report(&env, 42, actor.clone(), symbol_short!("spam"), None);

        assert_eq!(
            latest_reaction_nonce(&env, 42),
            2,
            "reaction nonce must be 2"
        );
        assert_eq!(
            latest_report_nonce(&env, 42),
            1,
            "report nonce must be 1 (independent counter)"
        );
    });
}
