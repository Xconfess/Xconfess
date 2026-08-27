use soroban_sdk::{Env};
use crate::action_generator::Action;
use crate::state_invariants::assert_invariants;

pub fn run_sequence(env: &Env, actions: Vec<Action>) {
    for action in actions {
        match action {
            Action::Create { actor } => {
                let _ = crate::contract::create_confession(env, actor);
            }
            Action::React { actor, confession_id } => {
                let _ = crate::contract::react(env, actor, confession_id);
            }
            Action::Report { actor, confession_id } => {
                let _ = crate::contract::report(env, actor, confession_id);
            }
            Action::Resolve { admin, confession_id } => {
                let _ = crate::contract::resolve(env, admin, confession_id);
            }
        }

        // 🚨 CRITICAL: Check invariants after every state mutation
        assert_invariants(env);
    }
}