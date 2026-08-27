use soroban_sdk::{contractevent, Address, Env, String};

pub const MAX_PAUSE_REASON_LEN: u32 = 128;
pub const PAUSE_REASON_TOO_LONG: &str = "pause reason too long";

#[contractevent(topics = ["paused"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PausedEvent {
    #[topic]
    pub actor: Address,
    pub reason: String,
}

#[contractevent(topics = ["unpaused"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnpausedEvent {
    #[topic]
    pub actor: Address,
    pub reason: String,
}

fn assert_reason_bounded(reason: &String) {
    if reason.len() > MAX_PAUSE_REASON_LEN {
        panic!("{}", PAUSE_REASON_TOO_LONG);
    }
}

pub fn emit_paused(env: &Env, actor: &Address, reason: String) {
    assert_reason_bounded(&reason);

    PausedEvent {
        actor: actor.clone(),
        reason,
    }
    .publish(env);
}

pub fn emit_unpaused(env: &Env, actor: &Address, reason: String) {
    assert_reason_bounded(&reason);

    UnpausedEvent {
        actor: actor.clone(),
        reason,
    }
    .publish(env);
}
