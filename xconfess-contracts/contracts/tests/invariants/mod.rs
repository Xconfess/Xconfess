mod action_generator;
mod sequence_runner;
mod state_invariants;
mod seeds;

use proptest::prelude::*;
use soroban_sdk::Env;
use action_generator::action_strategy;
use sequence_runner::run_sequence;

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 20, // CI safe
        max_shrink_iters: 0,
        .. ProptestConfig::default()
    })]

    #[test]
    fn invariant_randomized_sequences(actions in prop::collection::vec(
        action_strategy(5, 20), 1..50
    )) {
        let env = Env::default();
        crate::contract::init(&env);

        run_sequence(&env, actions);
    }
}