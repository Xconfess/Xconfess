#![no_std]

/// Stable backend-facing error codes for tipping contract
/// Maps from contract Error enum values to predictable 60xx codes
pub mod codes {
    pub const INVALID_TIP_AMOUNT: u32 = 6001;
    pub const METADATA_TOO_LONG: u32 = 6002;
    pub const TOTAL_OVERFLOW: u32 = 6003;
    pub const NONCE_OVERFLOW: u32 = 6004;
    pub const UNAUTHORIZED: u32 = 6005;
    pub const CONTRACT_PAUSED: u32 = 6006;
    pub const RATE_LIMITED: u32 = 6007;
    pub const INVALID_RATE_LIMIT_CONFIG: u32 = 6008;
    pub const TOKEN_NOT_CONFIGURED: u32 = 6009;
}

/// Error classification for backend retry strategy
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorClassification {
    Terminal,   // Invalid input, auth failure — do not retry
    Retryable,  // Transient (pause, rate limit) — may retry with backoff
    Unknown,    // Treat as terminal, log for investigation
}
