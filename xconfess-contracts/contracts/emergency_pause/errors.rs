use soroban_sdk::contracterror;

/// Stable error codes for the shared emergency-pause module.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PauseError {
    AlreadyPaused = 1,
    NotPaused = 2,
    Unauthorized = 3,
    ContractPaused = 4,
    /// A pause/unpause reason exceeded `MAX_PAUSE_REASON_LEN`.
    ReasonTooLong = 5,
}
