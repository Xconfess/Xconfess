#![no_std]
use soroban_sdk::{contracttype, contractevent, Env, Symbol};

// Example: ConfessionAnchor event
#[contractevent]
pub struct ConfessionSubmitted {
    pub sender: soroban_sdk::Address,
    pub confession_id: u64,
    pub message: String,
}

// Example: Anonymous tip event
#[contractevent]
pub struct TipReceived {
    pub sender: soroban_sdk::Address,
    pub recipient: soroban_sdk::Address,
    pub amount: i128,
}

// Example: Reputation badge event
#[contractevent]
pub struct BadgeAwarded {
    pub recipient: soroban_sdk::Address,
    pub badge_id: u32,
}
