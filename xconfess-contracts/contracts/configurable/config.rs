use soroban_sdk::{contractimpl, Env, BytesN};
use crate::configurable::access_control::Admin;
use crate::configurable::events::emit_config_update;

#[derive(Clone)]
pub struct Config {
    pub limits: u32,
    pub threshold: u32,
    pub window: u32,
    pub last_update: u64,
}

#[contractimpl]
impl Config {
    pub fn init(env: Env, limits: u32, threshold: u32, window: u32) -> Config {
        Config {
            limits,
            threshold,
            window,
            last_update: 0,
        }
    }

    pub fn update(
        &mut self,
        env: Env,
        admin: BytesN<32>,
        new_limits: u32,
        new_threshold: u32,
        new_window: u32,
    ) {
        Admin::require_admin(&env, &admin);

        assert!(new_limits <= 10_000, "limits exceed max");
        assert!(new_threshold <= 1_000, "threshold exceed max");
        assert!(new_window <= 86_400, "window exceed max");

        let now = env.ledger().timestamp();
        assert!(now - self.last_update >= 3600, "cooldown not elapsed");

        emit_config_update(&env, self.limits, self.threshold, self.window, new_limits, new_threshold, new_window);

        self.limits = new_limits;
        self.threshold = new_threshold;
        self.window = new_window;
        self.last_update = now;
    }
}