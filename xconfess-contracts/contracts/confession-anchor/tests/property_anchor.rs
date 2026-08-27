use std::collections::HashMap;

use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use proptest::prelude::*;
use proptest::test_runner::{Config, TestRunner};
use soroban_sdk::{BytesN, Env};

fn new_client() -> (Env, ConfessionAnchorClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);
    (env, client)
}

fn fixed_hash(env: &Env, seed: u64) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    let head = seed.to_be_bytes();
    let tail = seed.rotate_left(13).to_be_bytes();
    bytes[..8].copy_from_slice(&head);
    bytes[8..16].copy_from_slice(&tail);
    bytes[16..24].copy_from_slice(&head);
    bytes[24..32].copy_from_slice(&tail);
    BytesN::from_array(env, &bytes)
}

#[test]
fn property_hash_uniqueness_and_retrieval_consistency() {
    let mut runner = TestRunner::new(Config {
        cases: 128,
        ..Config::default()
    });

    let strategy = prop::collection::vec((any::<u64>(), any::<u64>()), 1..128);
    runner
        .run(&strategy, |samples| {
            let (env, client) = new_client();
            let mut seen: HashMap<[u8; 32], u64> = HashMap::new();

            for (hash_seed, ts) in samples {
                let hash = fixed_hash(&env, hash_seed);
                let mut k = [0u8; 32];
                k.copy_from_slice(hash.to_array().as_slice());

                let status = client.anchor_confession(&hash, &ts);
                if let Some(first_ts) = seen.get(&k) {
                    prop_assert_eq!(status, soroban_sdk::symbol_short!("exists"));
                    prop_assert_eq!(client.verify_confession(&hash), Some(*first_ts));
                } else {
                    seen.insert(k, ts);
                    prop_assert_eq!(status, soroban_sdk::symbol_short!("anchored"));
                    prop_assert_eq!(client.verify_confession(&hash), Some(ts));
                }
            }

            prop_assert_eq!(client.get_confession_count(), seen.len() as u64);
            Ok(())
        })
        .expect("property run should be reproducible and pass");
}

#[test]
fn property_boundary_and_malformed_like_inputs_are_handled() {
    let mut runner = TestRunner::new(Config {
        cases: 96,
        ..Config::default()
    });

    let strategy = prop::collection::vec(any::<u8>(), 0..64);
    runner
        .run(&strategy, |suffixes| {
            let (env, client) = new_client();

            let zero = BytesN::from_array(&env, &[0u8; 32]);
            let ff = BytesN::from_array(&env, &[0xFFu8; 32]);
            prop_assert_eq!(
                client.anchor_confession(&zero, &0),
                soroban_sdk::symbol_short!("anchored")
            );
            prop_assert_eq!(
                client.anchor_confession(&ff, &u64::MAX),
                soroban_sdk::symbol_short!("anchored")
            );
            prop_assert_eq!(client.verify_confession(&zero), Some(0));
            prop_assert_eq!(client.verify_confession(&ff), Some(u64::MAX));

            for b in suffixes {
                let mut raw = [0xAAu8; 32];
                raw[31] = b;
                let hash = BytesN::from_array(&env, &raw);
                let _ = client.anchor_confession(&hash, &(b as u64));
                prop_assert_eq!(client.verify_confession(&hash), Some(b as u64));
            }

            Ok(())
        })
        .expect("boundary property run should pass");
}
