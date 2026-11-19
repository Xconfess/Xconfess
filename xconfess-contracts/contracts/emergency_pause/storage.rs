use soroban_sdk::contracttype;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Paused,
    /// Monotonic counter for emergency pause state-change events.
    /// Absent before the first pause/unpause; reads as 0.
    PauseEventNonce,
}
