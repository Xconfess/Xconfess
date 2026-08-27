#![cfg(test)]

use confession_anchor::{ConfessionAnchor, ConfessionAnchorClient};
use soroban_sdk::{BytesN, Env, Symbol};

fn new_client() -> (Env, ConfessionAnchorClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ConfessionAnchor, ());
    let client = ConfessionAnchorClient::new(&env, &contract_id);
    (env, client)
}

#[test]
fn spam_hashes_rapidly() {
    let (env, client) = new_client();

    // Simulate 100 rapid submissions
    for i in 0..100 {
        let mut hash_data = [0u8; 32];
        let bytes = (i as u64).to_be_bytes();
        hash_data[0..bytes.len()].copy_from_slice(&bytes);

        let hash = BytesN::from_array(&env, &hash_data);
        client.anchor_confession(&hash, &(1670000000 + i as u64));
    }

    let count = client.get_confession_count();
    assert_eq!(count, 100);
}

#[test]
fn grief_duplicate_hashes() {
    let (env, client) = new_client();

    let hash_data = [7u8; 32];
    let hash = BytesN::from_array(&env, &hash_data);

    // First anchor should succeed and be recorded
    let res1 = client.anchor_confession(&hash, &1670000000);
    assert_eq!(res1, Symbol::new(&env, "anchored"));

    // Duplicate submissions of the identical hash should return exists and NOT consume extra storage rows
    // We already stored `hash` on line 40. So now we expect "exists" for every subsequent attempt.
    for _ in 0..50 {
        let res2 = client.anchor_confession(&hash, &1670000000);
        assert_eq!(res2, Symbol::new(&env, "exists"));
    }

    let total_count = client.get_confession_count();
    assert_eq!(
        total_count, 1,
        "Only 1 unique hash is stored regardless of griefing attempts"
    );
}
