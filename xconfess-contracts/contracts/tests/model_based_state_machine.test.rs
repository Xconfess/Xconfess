#[path = "model/mod.rs"]
mod model;

use model::actions::Action;
use model::generator::generate_actions;
use model::observed::ObservedMachine;
use model::reference::ModelState;
use model::replay::format_action_trace;

fn run_model_comparison(
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

        // Optional test-only fault injection to prove divergence detection.
        if inject_fault_at == Some(idx) {
            let _ = observed.apply(&Action::Create { actor: 9999 });
        }

        if reference_outcome != observed_outcome || &reference != observed.snapshot() {
            return Err(format!(
                "model divergence seed={seed} step={idx} action={action:?} trace={}",
                format_action_trace(&history)
            ));
        }
    }

    Ok(())
}

#[test]
fn fixed_seed_replay_is_deterministic() {
    let seed = 42_u64;
    let steps = 250_usize;

    let run_a = generate_actions(seed, steps);
    let run_b = generate_actions(seed, steps);

    assert_eq!(
        run_a, run_b,
        "same seed must produce identical action sequence"
    );
    assert!(run_model_comparison(seed, steps, None).is_ok());
}

#[test]
fn model_based_suite_multiple_seeds_no_divergence() {
    let seeds = [1_u64, 7, 42, 1234, 20260323];
    for seed in seeds {
        let result = run_model_comparison(seed, 300, None);
        assert!(
            result.is_ok(),
            "unexpected model divergence for seed {seed}: {}",
            result.err().unwrap_or_else(|| "unknown".to_string())
        );
    }
}

#[test]
fn model_suite_surfaces_failing_seed_and_trace() {
    let seed = 20260323_u64;
    let failure = run_model_comparison(seed, 120, Some(20));
    assert!(failure.is_err(), "fault injection should cause divergence");

    let message = failure.err().unwrap_or_default();
    assert!(message.contains("seed=20260323"));
    assert!(message.contains("step="));
    assert!(message.contains("trace="));
}
