use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PauseError {
    AlreadyPaused = 1,
    NotPaused = 2,
    Unauthorized = 3,
    ContractPaused = 4,
}
