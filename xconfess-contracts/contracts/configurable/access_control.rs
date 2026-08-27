use soroban_sdk::{Env, BytesN};

pub struct Admin;

impl Admin {
    pub fn require_admin(env: &Env, caller: &BytesN<32>) {
        let expected_admin = BytesN::from_array(env, &[0u8;32]); // replace with actual admin
        assert_eq!(caller, &expected_admin, "unauthorized: not admin");
    }
}