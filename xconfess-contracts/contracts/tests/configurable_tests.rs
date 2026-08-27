use soroban_sdk::{Env, BytesN};
use xconfess_contract::configurable::Config;

#[test]
fn test_config_update_success() {
    let env = Env::default();
    let mut cfg = Config::init(env.clone(), 1000, 100, 3600);
    let admin = BytesN::from_array(&env, &[0u8;32]);

    cfg.update(env.clone(), admin.clone(), 2000, 200, 7200);

    assert_eq!(cfg.limits, 2000);
    assert_eq!(cfg.threshold, 200);
    assert_eq!(cfg.window, 7200);
}

#[test]
#[should_panic(expected = "unauthorized: not admin")]
fn test_config_update_unauthorized() {
    let env = Env::default();
    let mut cfg = Config::init(env.clone(), 1000, 100, 3600);
    let fake_admin = BytesN::from_array(&env, &[1u8;32]);

    cfg.update(env.clone(), fake_admin, 2000, 200, 7200);
}

#[test]
#[should_panic(expected = "limits exceed max")]
fn test_config_update_out_of_bounds() {
    let env = Env::default();
    let mut cfg = Config::init(env.clone(), 1000, 100, 3600);
    let admin = BytesN::from_array(&env, &[0u8;32]);

    cfg.update(env.clone(), admin, 20_000, 200, 7200);
}

#[test]
#[should_panic(expected = "cooldown not elapsed")]
fn test_config_update_cooldown() {
    let env = Env::default();
    let mut cfg = Config::init(env.clone(), 1000, 100, 3600);
    let admin = BytesN::from_array(&env, &[0u8;32]);

    cfg.update(env.clone(), admin.clone(), 2000, 200, 7200);
    cfg.update(env.clone(), admin.clone(), 3000, 300, 7200);
}