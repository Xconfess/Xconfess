use soroban_sdk::{contractevent, Env};

#[contractevent(topics = ["ConfigUpdate"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigUpdateEvent {
    pub old_limits: u32,
    pub old_threshold: u32,
    pub old_window: u32,
    pub new_limits: u32,
    pub new_threshold: u32,
    pub new_window: u32,
}

pub fn emit_config_update(
    env: &Env,
    old_limits: u32,
    old_threshold: u32,
    old_window: u32,
    new_limits: u32,
    new_threshold: u32,
    new_window: u32,
) {
    ConfigUpdateEvent {
        old_limits,
        old_threshold,
        old_window,
        new_limits,
        new_threshold,
        new_window,
    }
    .publish(env);
}
