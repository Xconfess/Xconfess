use soroban_sdk::contracttype;

/// ============================================================================
/// ERROR REGISTRY VERSION TRACKING
/// ============================================================================
/// Bump when error code mapping changes in a breaking way (new errors that
/// consume codes, or existing codes are reassigned). Consumers MUST check
/// this version before relying on error code semantics.
#[allow(dead_code)]
pub const ERROR_REGISTRY_VERSION: u32 = 1;

/// ============================================================================
/// ERROR CLASSIFICATION
/// ============================================================================
/// Used by backend to determine retry strategy and API response code.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ErrorClassification {
    /// Retryable errors (transient; may succeed on retry with backoff)
    /// - Network timeouts, race conditions, resource exhaustion
    /// Maps to: HTTP 503 Service Unavailable, exponential backoff recommended
    Retryable,

    /// Terminal errors (caller's fault; retry won't help)
    /// - Invalid input, authorization failures, business logic violations
    /// Maps to: HTTP 400 Bad Request or 409 Conflict, no retry
    Terminal,

    /// Unknown classification (safe default: treat as terminal, log for investigation)
    Unknown,
}

/// ============================================================================
/// STABLE ERROR CODE RANGES
/// ============================================================================
/// These ranges are reserved and stable across contract versions.
/// - 1000-1999: Global/Common errors
/// - 2000-2999: Confession module errors
/// - 3000-3999: Reaction module errors
/// - 4000-4999: Report/Governance module errors
/// - 5000-5999: Future module errors
/// - 6000-6999: Anonymous Tipping contract errors (MAPPED FROM 1-8)
/// - 9000-9999: Metadata/registry compatibility issues (do not use)
///
/// Within each range:
/// - First 10-50 codes are stable and well-documented
/// - Higher codes allow for future additions without shifting existing ones
pub mod codes {
    /// ====== Global/Common Errors (1000-1099) ======
    pub const UNAUTHORIZED: u32 = 1000;
    pub const NOT_FOUND: u32 = 1001;
    pub const INVALID_INPUT: u32 = 1002;
    pub const OVERFLOW: u32 = 1003;
    pub const COOLDOWN_ACTIVE: u32 = 1004;
    pub const PAYLOAD_TOO_LARGE: u32 = 1005;
    pub const METADATA_TOO_LONG: u32 = 1006;

    /// ====== Confession Module Errors (2000-2099) ======
    pub const CONFESSION_EXISTS: u32 = 2000;
    pub const CONFESSION_EMPTY: u32 = 2001;
    pub const CONFESSION_TOO_LONG: u32 = 2002;

    /// ====== Reaction Module Errors (3000-3099) ======
    pub const REACTION_EXISTS: u32 = 3000;
    pub const INVALID_REACTION_TYPE: u32 = 3001;

    /// ====== Report/Governance Module Errors (4000-4099) ======
    pub const REPORT_EXISTS: u32 = 4000;
    pub const INVALID_REPORT_REASON: u32 = 4001;
    pub const REPORT_REASON_TOO_LONG: u32 = 4002;

    /// ====== Governance Module Errors (5000-5099) ======
    pub const PROPOSAL_NOT_FOUND: u32 = 5000;
    pub const UNAUTHORIZED_APPROVAL: u32 = 5001;
    pub const QUORUM_NOT_REACHED: u32 = 5002;
    pub const ALREADY_APPROVED: u32 = 5003;
    pub const ALREADY_EXECUTED: u32 = 5004;
    pub const INVALID_ACTION: u32 = 5005;

    /// ====== Anonymous Tipping Contract Errors (6000-6099) ======
    /// Mapped from enum values 1-9 to stable 6000-series for backend consumption
    pub const TIPPING_INVALID_AMOUNT: u32 = 6001;
    pub const TIPPING_METADATA_TOO_LONG: u32 = 6002;
    pub const TIPPING_TOTAL_OVERFLOW: u32 = 6003;
    pub const TIPPING_NONCE_OVERFLOW: u32 = 6004;
    pub const TIPPING_UNAUTHORIZED: u32 = 6005;
    pub const TIPPING_CONTRACT_PAUSED: u32 = 6006;
    pub const TIPPING_RATE_LIMITED: u32 = 6007;
    pub const TIPPING_INVALID_RATE_LIMIT_CONFIG: u32 = 6008;
    pub const TIPPING_TOKEN_NOT_CONFIGURED: u32 = 6009;
}

/// ============================================================================
/// CONFESSION-ANCHOR CONTRACT ERROR ENUM
/// ============================================================================
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContractError {
    /// ===========================================
    /// Global / common errors
    /// ===========================================
    Unauthorized, // caller not authorized (1000)
    NotFound,        // requested entity not found (1001)
    InvalidInput,    // input value invalid (1002)
    Overflow,        // arithmetic overflow (1003)
    CooldownActive,  // update cooldown not elapsed (1004)
    PayloadTooLarge, // emitted payload or metadata exceeds configured bound (1005)
    MetadataTooLong, // metadata field length exceeded (1006)

    /// ===========================================
    /// Confession module errors
    /// ===========================================
    ConfessionExists, // trying to create a duplicate confession (2000)
    ConfessionEmpty,   // empty confession content (2001)
    ConfessionTooLong, // content exceeds max length (2002)

    /// ===========================================
    /// Reaction module errors
    /// ===========================================
    ReactionExists, // user already reacted (3000)
    InvalidReactionType, // reaction type not recognized (3001)

    /// ===========================================
    /// Report module errors
    /// ===========================================
    ReportExists, // user already reported (4000)
    InvalidReportReason, // report reason not allowed (4001)
    ReportReasonTooLong, // report reason exceeds configured max (4002)

    /// ===========================================
    /// Governance module errors
    /// ===========================================
    ProposalNotFound, // governance proposal not found (5000)
    UnauthorizedApproval, // caller not authorized to approve (5001)
    QuorumNotReached,     // quorum threshold not met (5002)
    AlreadyApproved,      // caller already approved this proposal (5003)
    AlreadyExecuted,      // proposal already executed (5004)
    InvalidAction,        // invalid governance action (5005)
}

impl ContractError {
    pub fn code(&self) -> u32 {
        match self {
            ContractError::Unauthorized => codes::UNAUTHORIZED,
            ContractError::NotFound => codes::NOT_FOUND,
            ContractError::InvalidInput => codes::INVALID_INPUT,
            ContractError::Overflow => codes::OVERFLOW,
            ContractError::CooldownActive => codes::COOLDOWN_ACTIVE,
            ContractError::PayloadTooLarge => codes::PAYLOAD_TOO_LARGE,
            ContractError::MetadataTooLong => codes::METADATA_TOO_LONG,

            ContractError::ConfessionExists => codes::CONFESSION_EXISTS,
            ContractError::ConfessionEmpty => codes::CONFESSION_EMPTY,
            ContractError::ConfessionTooLong => codes::CONFESSION_TOO_LONG,

            ContractError::ReactionExists => codes::REACTION_EXISTS,
            ContractError::InvalidReactionType => codes::INVALID_REACTION_TYPE,

            ContractError::ReportExists => codes::REPORT_EXISTS,
            ContractError::InvalidReportReason => codes::INVALID_REPORT_REASON,
            ContractError::ReportReasonTooLong => codes::REPORT_REASON_TOO_LONG,

            ContractError::ProposalNotFound => codes::PROPOSAL_NOT_FOUND,
            ContractError::UnauthorizedApproval => codes::UNAUTHORIZED_APPROVAL,
            ContractError::QuorumNotReached => codes::QUORUM_NOT_REACHED,
            ContractError::AlreadyApproved => codes::ALREADY_APPROVED,
            ContractError::AlreadyExecuted => codes::ALREADY_EXECUTED,
            ContractError::InvalidAction => codes::INVALID_ACTION,
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            ContractError::Unauthorized => "caller not authorized",
            ContractError::NotFound => "entity not found",
            ContractError::InvalidInput => "invalid input",
            ContractError::Overflow => "arithmetic overflow",
            ContractError::CooldownActive => "cooldown period not elapsed",
            ContractError::PayloadTooLarge => "payload exceeds configured limit",
            ContractError::MetadataTooLong => "metadata field too long",

            ContractError::ConfessionExists => "confession already exists",
            ContractError::ConfessionEmpty => "confession content empty",
            ContractError::ConfessionTooLong => "confession content too long",

            ContractError::ReactionExists => "reaction already exists",
            ContractError::InvalidReactionType => "reaction type invalid",

            ContractError::ReportExists => "report already exists",
            ContractError::InvalidReportReason => "report reason invalid",
            ContractError::ReportReasonTooLong => "report reason too long",

            ContractError::ProposalNotFound => "governance proposal not found",
            ContractError::UnauthorizedApproval => "caller not authorized to approve",
            ContractError::QuorumNotReached => "quorum threshold not met",
            ContractError::AlreadyApproved => "caller already approved this proposal",
            ContractError::AlreadyExecuted => "proposal already executed",
            ContractError::InvalidAction => "invalid governance action",
        }
    }

    /// Classify error for backend retry/response strategy.
    /// Terminal errors (invalid input, auth failure) should not be retried.
    /// Retryable errors (overflow, cooldown) may succeed with backoff.
    pub fn classification(&self) -> ErrorClassification {
        match self {
            // Terminal: caller's responsibility to fix
            ContractError::Unauthorized => ErrorClassification::Terminal,
            ContractError::InvalidInput => ErrorClassification::Terminal,
            ContractError::InvalidReactionType => ErrorClassification::Terminal,
            ContractError::InvalidReportReason => ErrorClassification::Terminal,
            ContractError::ReportReasonTooLong => ErrorClassification::Terminal,
            ContractError::PayloadTooLarge => ErrorClassification::Terminal,
            ContractError::MetadataTooLong => ErrorClassification::Terminal,
            ContractError::ConfessionEmpty => ErrorClassification::Terminal,
            ContractError::ConfessionTooLong => ErrorClassification::Terminal,
            ContractError::UnauthorizedApproval => ErrorClassification::Terminal,
            ContractError::InvalidAction => ErrorClassification::Terminal,

            // Retryable: transient state or resource contention
            ContractError::CooldownActive => ErrorClassification::Retryable,
            ContractError::Overflow => ErrorClassification::Retryable,

            // Terminal: business logic violations
            ContractError::NotFound => ErrorClassification::Terminal,
            ContractError::ConfessionExists => ErrorClassification::Terminal,
            ContractError::ReactionExists => ErrorClassification::Terminal,
            ContractError::ReportExists => ErrorClassification::Terminal,
            ContractError::ProposalNotFound => ErrorClassification::Terminal,
            ContractError::QuorumNotReached => ErrorClassification::Terminal,
            ContractError::AlreadyApproved => ErrorClassification::Terminal,
            ContractError::AlreadyExecuted => ErrorClassification::Terminal,
        }
    }
}
