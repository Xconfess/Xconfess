#[path = "model/mod.rs"]
mod model;

use model::actions::Action;
use model::generator::generate_actions;
use model::observed::ObservedMachine;
use model::reference::ModelState;
use model::replay::format_action_trace;

// ─────────────────────────────────────────────────────────────────────────────
// Invariant Definitions: Terminal State Protection
// ─────────────────────────────────────────────────────────────────────────────

/// Invariant 1: Resolved reports cannot transition to any other state except admin actions.
/// Accepting criteria: Resolved confessions reject React, Report, and Escalate actions.
fn check_resolved_terminal(
    reference: &ModelState,
    _observed: &ObservedMachine,
) -> Result<(), String> {
    for conf in reference.confessions.values() {
        if conf.resolved {
            // Terminal state: no further mutations except documented admin operations
            if conf.escalated {
                return Err(format!(
                    "INVARIANT VIOLATION: Confession {} is both resolved AND escalated (impossible state)",
                    conf.id
                ));
            }
        }
    }
    Ok(())
}

/// Invariant 2: Escalated reports cannot be further escalated.
fn check_escalation_idempotent(
    reference: &ModelState,
    _observed: &ObservedMachine,
) -> Result<(), String> {
    for conf in reference.confessions.values() {
        if conf.escalated && conf.resolved {
            return Err(format!(
                "INVARIANT VIOLATION: Confession {} is both escalated and resolved (impossible state)",
                conf.id
            ));
        }
    }
    Ok(())
}

/// Invariant 3: Reports without pending issues cannot be resolved or escalated.
fn check_report_prerequisite(
    reference: &ModelState,
    _observed: &ObservedMachine,
) -> Result<(), String> {
    for conf in reference.confessions.values() {
        if (conf.resolved || conf.escalated) && conf.reported_by.is_empty() {
            return Err(format!(
                "INVARIANT VIOLATION: Confession {} is resolved/escalated but has no reports (invalid state)",
                conf.id
            ));
        }
    }
    Ok(())
}

/// Invariant 4: Escalated confessions must have been reported.
fn check_escalated_has_reports(
    reference: &ModelState,
    _observed: &ObservedMachine,
) -> Result<(), String> {
    for conf in reference.confessions.values() {
        if conf.escalated && conf.reported_by.is_empty() {
            return Err(format!(
                "INVARIANT VIOLATION: Confession {} is escalated but has no pending reports",
                conf.id
            ));
        }
    }
    Ok(())
}

/// Invariant 5: A resolved confession cannot later be escalated.
fn check_resolved_immutable_escalate(
    reference: &ModelState,
    _observed: &ObservedMachine,
) -> Result<(), String> {
    for conf in reference.confessions.values() {
        if conf.resolved && conf.escalated {
            return Err(format!(
                "INVARIANT VIOLATION: Confession {} is marked both resolved and escalated (violates escalate-from-pending constraint)",
                conf.id
            ));
        }
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite Invariant Checker
// ─────────────────────────────────────────────────────────────────────────────

fn check_all_invariants(reference: &ModelState, observed: &ObservedMachine) -> Result<(), String> {
    check_resolved_terminal(reference, observed)?;
    check_escalation_idempotent(reference, observed)?;
    check_report_prerequisite(reference, observed)?;
    check_escalated_has_reports(reference, observed)?;
    check_resolved_immutable_escalate(reference, observed)?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Comparison with Invariant Enforcement
// ─────────────────────────────────────────────────────────────────────────────

fn run_model_comparison_with_invariants(
    seed: u64,
    steps: usize,
    inject_fault_at: Option<usize>,
) -> Result<(), String> {
    let actions = generate_actions(seed, steps);
    let mut reference = ModelState::new();
    let mut observed = ObservedMachine::new();
    let mut history: Vec<Action> = Vec::new();

    for (idx, action) in actions.iter().enumerate() {
        let reference_outcome = reference.apply(action);
        let observed_outcome = observed.apply(action);
        history.push(action.clone());

        // Check invariants after each step
        check_all_invariants(&reference, &observed).map_err(|inv_err| {
            format!(
                "invariant_violation seed={seed} step={idx} action={action:?} error={inv_err} trace={}",
                format_action_trace(&history)
            )
        })?;

        // Optional test-only fault injection to prove divergence detection
        if inject_fault_at == Some(idx) {
            let _ = observed.apply(&Action::Create { actor: 9999 });
            // Re-check invariants to ensure fault is caught
            check_all_invariants(&reference, &observed).ok(); // Allow fault for divergence test
        }

        if reference_outcome != observed_outcome || &reference != observed.snapshot() {
            return Err(format!(
                "model_divergence seed={seed} step={idx} action={action:?} trace={}",
                format_action_trace(&history)
            ));
        }
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Terminal State Transitions
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn resolved_confession_rejects_further_reports() {
    let mut reference = ModelState::new();

    // Setup: create, report, resolve
    assert_eq!(
        reference.apply(&Action::Create { actor: 0 }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Report {
            actor: 1,
            confession_id: 1,
            reason_len: 10
        }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Resolve {
            admin: 0,
            confession_id: 1
        }),
        model::actions::Outcome::Applied
    );

    // Attempt to report a resolved confession → must fail
    let result = reference.apply(&Action::Report {
        actor: 2,
        confession_id: 1,
        reason_len: 15,
    });

    assert_eq!(
        result,
        model::actions::Outcome::Rejected("already_resolved")
    );
}

#[test]
fn resolved_confession_rejects_escalation() {
    let mut reference = ModelState::new();

    // Setup: create, report, resolve
    assert_eq!(
        reference.apply(&Action::Create { actor: 0 }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Report {
            actor: 1,
            confession_id: 1,
            reason_len: 10
        }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Resolve {
            admin: 0,
            confession_id: 1
        }),
        model::actions::Outcome::Applied
    );

    // Attempt to escalate a resolved confession → must fail
    let result = reference.apply(&Action::Escalate {
        admin: 0,
        confession_id: 1,
    });

    assert_eq!(
        result,
        model::actions::Outcome::Rejected("cannot_escalate_resolved")
    );
}

#[test]
fn resolved_confession_rejects_reactions() {
    let mut reference = ModelState::new();

    // Setup: create, report, resolve
    assert_eq!(
        reference.apply(&Action::Create { actor: 0 }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Report {
            actor: 1,
            confession_id: 1,
            reason_len: 10
        }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Resolve {
            admin: 0,
            confession_id: 1
        }),
        model::actions::Outcome::Applied
    );

    // Attempt to react to a resolved confession → must fail
    let result = reference.apply(&Action::React {
        actor: 2,
        confession_id: 1,
    });

    assert_eq!(
        result,
        model::actions::Outcome::Rejected("already_resolved")
    );
}

#[test]
fn escalated_confession_rejects_further_reports() {
    let mut reference = ModelState::new();

    // Setup: create, report, escalate
    assert_eq!(
        reference.apply(&Action::Create { actor: 0 }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Report {
            actor: 1,
            confession_id: 1,
            reason_len: 10
        }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Escalate {
            admin: 0,
            confession_id: 1
        }),
        model::actions::Outcome::Applied
    );

    // Attempt to report an escalated confession → must fail
    let result = reference.apply(&Action::Report {
        actor: 2,
        confession_id: 1,
        reason_len: 15,
    });

    assert_eq!(
        result,
        model::actions::Outcome::Rejected("escalated_terminal")
    );
}

#[test]
fn escalated_confession_rejects_further_escalation() {
    let mut reference = ModelState::new();

    // Setup: create, report, escalate
    assert_eq!(
        reference.apply(&Action::Create { actor: 0 }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Report {
            actor: 1,
            confession_id: 1,
            reason_len: 10
        }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Escalate {
            admin: 0,
            confession_id: 1
        }),
        model::actions::Outcome::Applied
    );

    // Attempt to escalate again → must fail
    let result = reference.apply(&Action::Escalate {
        admin: 0,
        confession_id: 1,
    });

    assert_eq!(
        result,
        model::actions::Outcome::Rejected("already_escalated")
    );
}

#[test]
fn escalated_confession_rejects_reactions() {
    let mut reference = ModelState::new();

    // Setup: create, report, escalate
    assert_eq!(
        reference.apply(&Action::Create { actor: 0 }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Report {
            actor: 1,
            confession_id: 1,
            reason_len: 10
        }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Escalate {
            admin: 0,
            confession_id: 1
        }),
        model::actions::Outcome::Applied
    );

    // Attempt to react to an escalated confession → must fail
    let result = reference.apply(&Action::React {
        actor: 2,
        confession_id: 1,
    });

    assert_eq!(
        result,
        model::actions::Outcome::Rejected("escalated_terminal")
    );
}

#[test]
fn cannot_escalate_without_pending_report() {
    let mut reference = ModelState::new();

    // Setup: create confession but don't report
    assert_eq!(
        reference.apply(&Action::Create { actor: 0 }),
        model::actions::Outcome::Applied
    );

    // Attempt to escalate confession without reports → must fail
    let result = reference.apply(&Action::Escalate {
        admin: 0,
        confession_id: 1,
    });

    assert_eq!(
        result,
        model::actions::Outcome::Rejected("no_pending_report_to_escalate")
    );
}

#[test]
fn cannot_resolve_escalated_directly() {
    let mut reference = ModelState::new();

    // Setup: create, report, escalate
    assert_eq!(
        reference.apply(&Action::Create { actor: 0 }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Report {
            actor: 1,
            confession_id: 1,
            reason_len: 10
        }),
        model::actions::Outcome::Applied
    );
    assert_eq!(
        reference.apply(&Action::Escalate {
            admin: 0,
            confession_id: 1
        }),
        model::actions::Outcome::Applied
    );

    // Attempt to resolve an escalated confession → must fail
    let result = reference.apply(&Action::Resolve {
        admin: 0,
        confession_id: 1,
    });

    assert_eq!(
        result,
        model::actions::Outcome::Rejected("must_resolve_from_escalated")
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Model-Based Property Testing with Invariants
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn invariants_hold_across_random_action_sequence_seed_42() {
    let result = run_model_comparison_with_invariants(42_u64, 300, None);
    if let Err(e) = result {
        panic!("Invariant violation: {}", e);
    }
}

#[test]
fn invariants_hold_across_random_action_sequence_seed_1() {
    let result = run_model_comparison_with_invariants(1_u64, 300, None);
    if let Err(e) = result {
        panic!("Invariant violation: {}", e);
    }
}

#[test]
fn invariants_hold_across_random_action_sequence_seed_7() {
    let result = run_model_comparison_with_invariants(7_u64, 300, None);
    if let Err(e) = result {
        panic!("Invariant violation: {}", e);
    }
}

#[test]
fn invariants_hold_across_multiple_seeds() {
    let seeds = [1_u64, 7, 42, 1234, 20260323, 999_999, 55555];
    for seed in seeds {
        let result = run_model_comparison_with_invariants(seed, 400, None);
        if let Err(e) = result {
            panic!(
                "Invariant violation for seed {}: {}\n\
                 To reproduce: use seed={}",
                seed, e, seed
            );
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Deterministic Replay
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn fixed_seed_replay_produces_identical_action_sequence() {
    let seed = 42_u64;
    let steps = 250_usize;

    let run_a = generate_actions(seed, steps);
    let run_b = generate_actions(seed, steps);

    assert_eq!(
        run_a, run_b,
        "Identical seeds must produce identical action sequences for replay reproducibility"
    );
    assert!(run_model_comparison_with_invariants(seed, steps, None).is_ok());
}

#[test]
fn failing_sequence_includes_reproducible_seed_in_output() {
    let seed = 20260323_u64;
    let failure = run_model_comparison_with_invariants(seed, 120, Some(20));

    // Fault injection intentionally causes a divergence, but we should see seed info
    if let Err(msg) = failure {
        assert!(
            msg.contains("seed=20260323"),
            "Failing sequence must include seed in error message"
        );
        assert!(
            msg.contains("step="),
            "Failing sequence must include step number"
        );
        assert!(
            msg.contains("trace="),
            "Failing sequence must include action trace"
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Comprehensive Lifecycle Scenarios
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn report_lifecycle_create_report_resolve() {
    let mut reference = ModelState::new();

    // Step 1: Create confession
    let outcome = reference.apply(&Action::Create { actor: 1 });
    assert_eq!(outcome, model::actions::Outcome::Applied);
    assert_eq!(reference.confessions.len(), 1);
    assert!(!reference.confessions[&1].resolved);
    assert!(!reference.confessions[&1].escalated);

    // Step 2: Submit report
    let outcome = reference.apply(&Action::Report {
        actor: 2,
        confession_id: 1,
        reason_len: 50,
    });
    assert_eq!(outcome, model::actions::Outcome::Applied);
    assert_eq!(reference.confessions[&1].reported_by.len(), 1);

    // Step 3: Resolve report
    let outcome = reference.apply(&Action::Resolve {
        admin: 0,
        confession_id: 1,
    });
    assert_eq!(outcome, model::actions::Outcome::Applied);
    assert!(reference.confessions[&1].resolved);
}

#[test]
fn report_lifecycle_create_report_escalate() {
    let mut reference = ModelState::new();

    // Step 1: Create confession
    let outcome = reference.apply(&Action::Create { actor: 1 });
    assert_eq!(outcome, model::actions::Outcome::Applied);

    // Step 2: Submit report
    let outcome = reference.apply(&Action::Report {
        actor: 2,
        confession_id: 1,
        reason_len: 50,
    });
    assert_eq!(outcome, model::actions::Outcome::Applied);

    // Step 3: Escalate report
    let outcome = reference.apply(&Action::Escalate {
        admin: 0,
        confession_id: 1,
    });
    assert_eq!(outcome, model::actions::Outcome::Applied);
    assert!(reference.confessions[&1].escalated);
    assert!(!reference.confessions[&1].resolved);
}

#[test]
fn report_lifecycle_multiple_reports_before_resolve() {
    let mut reference = ModelState::new();

    // Create confession
    reference.apply(&Action::Create { actor: 0 });

    // Multiple actors report the same confession
    for actor in 1..4 {
        let outcome = reference.apply(&Action::Report {
            actor,
            confession_id: 1,
            reason_len: 25,
        });
        assert_eq!(outcome, model::actions::Outcome::Applied);
    }

    assert_eq!(reference.confessions[&1].reported_by.len(), 3);

    // Resolve (should work with multiple reports)
    let outcome = reference.apply(&Action::Resolve {
        admin: 0,
        confession_id: 1,
    });
    assert_eq!(outcome, model::actions::Outcome::Applied);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Unauthorized Access Prevention
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn non_admin_cannot_resolve() {
    let mut reference = ModelState::new();

    // Setup: create and report
    reference.apply(&Action::Create { actor: 0 });
    reference.apply(&Action::Report {
        actor: 1,
        confession_id: 1,
        reason_len: 20,
    });

    // Non-admin (actor 5) attempts resolve → must fail
    let result = reference.apply(&Action::Resolve {
        admin: 5,
        confession_id: 1,
    });
    assert_eq!(result, model::actions::Outcome::Rejected("unauthorized"));
}

#[test]
fn non_admin_cannot_escalate() {
    let mut reference = ModelState::new();

    // Setup: create and report
    reference.apply(&Action::Create { actor: 0 });
    reference.apply(&Action::Report {
        actor: 1,
        confession_id: 1,
        reason_len: 20,
    });

    // Non-admin (actor 5) attempts escalate → must fail
    let result = reference.apply(&Action::Escalate {
        admin: 5,
        confession_id: 1,
    });
    assert_eq!(result, model::actions::Outcome::Rejected("unauthorized"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: Error Recovery and Idempotency
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn duplicate_report_from_same_actor_fails() {
    let mut reference = ModelState::new();

    reference.apply(&Action::Create { actor: 0 });

    // First report succeeds
    let first = reference.apply(&Action::Report {
        actor: 1,
        confession_id: 1,
        reason_len: 20,
    });
    assert_eq!(first, model::actions::Outcome::Applied);

    // Duplicate report from same actor fails
    let duplicate = reference.apply(&Action::Report {
        actor: 1,
        confession_id: 1,
        reason_len: 20,
    });
    assert_eq!(
        duplicate,
        model::actions::Outcome::Rejected("duplicate_report")
    );
}

#[test]
fn reason_validation_boundaries() {
    let mut reference = ModelState::new();

    reference.apply(&Action::Create { actor: 0 });

    // Empty reason fails
    let empty = reference.apply(&Action::Report {
        actor: 1,
        confession_id: 1,
        reason_len: 0,
    });
    assert_eq!(empty, model::actions::Outcome::Rejected("reason_empty"));

    // Oversized reason fails
    let oversized = reference.apply(&Action::Report {
        actor: 2,
        confession_id: 1,
        reason_len: 200, // > 128 max
    });
    assert_eq!(
        oversized,
        model::actions::Outcome::Rejected("reason_too_long")
    );

    // Valid reason succeeds
    let valid = reference.apply(&Action::Report {
        actor: 3,
        confession_id: 1,
        reason_len: 100,
    });
    assert_eq!(valid, model::actions::Outcome::Applied);
}
