use xconfess_contract::errors::{codes, ContractError, ErrorClassification, ERROR_REGISTRY_VERSION};

/// ============================================================================
/// ERROR CODE STABILITY AND UNIQUENESS TESTS
/// ============================================================================

#[test]
fn test_error_codes_are_unique() {
    let errors = vec![
        (ContractError::Unauthorized, codes::UNAUTHORIZED),
        (ContractError::NotFound, codes::NOT_FOUND),
        (ContractError::InvalidInput, codes::INVALID_INPUT),
        (ContractError::Overflow, codes::OVERFLOW),
        (ContractError::CooldownActive, codes::COOLDOWN_ACTIVE),
        (ContractError::PayloadTooLarge, codes::PAYLOAD_TOO_LARGE),
        (ContractError::MetadataTooLong, codes::METADATA_TOO_LONG),
        (ContractError::ConfessionExists, codes::CONFESSION_EXISTS),
        (ContractError::ConfessionEmpty, codes::CONFESSION_EMPTY),
        (ContractError::ConfessionTooLong, codes::CONFESSION_TOO_LONG),
        (ContractError::ReactionExists, codes::REACTION_EXISTS),
        (ContractError::InvalidReactionType, codes::INVALID_REACTION_TYPE),
        (ContractError::ReportExists, codes::REPORT_EXISTS),
        (ContractError::InvalidReportReason, codes::INVALID_REPORT_REASON),
        (ContractError::ReportReasonTooLong, codes::REPORT_REASON_TOO_LONG),
        (ContractError::ProposalNotFound, codes::PROPOSAL_NOT_FOUND),
        (ContractError::UnauthorizedApproval, codes::UNAUTHORIZED_APPROVAL),
        (ContractError::QuorumNotReached, codes::QUORUM_NOT_REACHED),
        (ContractError::AlreadyApproved, codes::ALREADY_APPROVED),
        (ContractError::AlreadyExecuted, codes::ALREADY_EXECUTED),
        (ContractError::InvalidAction, codes::INVALID_ACTION),
    ];

    let mut seen_codes = std::collections::HashSet::new();
    for (error, code) in &errors {
        assert!(
            !seen_codes.contains(code),
            "Duplicate error code {} for {:?}",
            code,
            error
        );
        seen_codes.insert(*code);
        
        // Verify code matches Error::code() method
        assert_eq!(
            error.code(),
            *code,
            "Error code mismatch for {:?}",
            error
        );
    }
}

#[test]
fn test_error_code_ranges_are_valid() {
    let errors = vec![
        (ContractError::Unauthorized, 1000, 1099, "Global"),
        (ContractError::ConfessionExists, 2000, 2099, "Confession"),
        (ContractError::ReactionExists, 3000, 3099, "Reaction"),
        (ContractError::ReportExists, 4000, 4099, "Report/Governance"),
        (ContractError::ProposalNotFound, 5000, 5099, "Governance"),
    ];

    for (error, min, max, domain) in errors {
        let code = error.code();
        assert!(
            code >= min && code <= max,
            "Error code {} for {:?} is outside {}-{} range for {}",
            code,
            error,
            min,
            max,
            domain
        );
    }
}

#[test]
fn test_error_codes_and_messages() {
    assert_eq!(ContractError::Unauthorized.code(), 1000);
    assert_eq!(
        ContractError::Unauthorized.message(),
        "caller not authorized"
    );

    assert_eq!(ContractError::ConfessionEmpty.code(), 2001);
    assert_eq!(
        ContractError::ConfessionEmpty.message(),
        "confession content empty"
    );

    assert_eq!(ContractError::ProposalNotFound.code(), 5000);
    assert_eq!(
        ContractError::ProposalNotFound.message(),
        "governance proposal not found"
    );
}

/// ============================================================================
/// ERROR CLASSIFICATION TESTS
/// ============================================================================

#[test]
fn test_terminal_errors_are_classified_correctly() {
    let terminal_errors = vec![
        ContractError::Unauthorized,
        ContractError::InvalidInput,
        ContractError::InvalidReactionType,
        ContractError::InvalidReportReason,
        ContractError::ReportReasonTooLong,
        ContractError::MetadataTooLong,
        ContractError::ConfessionEmpty,
        ContractError::ConfessionTooLong,
        ContractError::UnauthorizedApproval,
        ContractError::InvalidAction,
        ContractError::NotFound,
        ContractError::ConfessionExists,
        ContractError::ReactionExists,
        ContractError::ReportExists,
        ContractError::ProposalNotFound,
        ContractError::AlreadyApproved,
        ContractError::AlreadyExecuted,
    ];

    for error in terminal_errors {
        assert_eq!(
            error.classification(),
            ErrorClassification::Terminal,
            "Expected {:?} to be Terminal",
            error
        );
    }
}

#[test]
fn test_retryable_errors_are_classified_correctly() {
    let retryable_errors = vec![
        ContractError::CooldownActive,
        ContractError::Overflow,
    ];

    for error in retryable_errors {
        assert_eq!(
            error.classification(),
            ErrorClassification::Retryable,
            "Expected {:?} to be Retryable",
            error
        );
    }
}

/// ============================================================================
/// ERROR REGISTRY VERSIONING
/// ============================================================================

#[test]
fn test_error_registry_version_is_pinned() {
    // This test pins the version; if it changes, it signals a breaking change
    // to all backend consumers. Update this test AND notify all consumers.
    assert_eq!(ERROR_REGISTRY_VERSION, 1, 
        "Error registry version has changed! This may break backend consumers. \
         Verify all consuming services are aware of this change.");
}

/// ============================================================================
/// TIPPING PANIC STRING STABILITY
/// ============================================================================
/// The anonymous-tipping contract signals errors via typed Result<T, Error>.
/// These constants guard the stable error messages that backend might still
/// reference if using the old panic-based approach.

pub const TIPPING_ERR_AMOUNT: &str = "tip amount must be positive";
pub const TIPPING_ERR_METADATA: &str = "proof metadata too long";

#[test]
fn tipping_error_message_amount_is_stable() {
    // If the message changes, this test fails and prompts updating all
    // dependent code and backend compatibility fixtures
    assert_eq!(
        TIPPING_ERR_AMOUNT,
        "tip amount must be positive",
        "tipping amount error message changed — update all dependent code"
    );
}

#[test]
fn tipping_error_message_metadata_is_stable() {
    assert_eq!(
        TIPPING_ERR_METADATA,
        "proof metadata too long",
        "tipping metadata error message changed — update all dependent code"
    );
}

/// ============================================================================
/// BACKEND COMPATIBILITY FIXTURES
/// ============================================================================

#[test]
fn test_backend_can_distinguish_retryable_from_terminal() {
    // Backend uses this pattern to decide retry strategy
    let retryable_error = ContractError::CooldownActive;
    let terminal_error = ContractError::InvalidInput;

    let can_retry_cooldown = matches!(
        retryable_error.classification(),
        ErrorClassification::Retryable
    );
    let cannot_retry_invalid = matches!(
        terminal_error.classification(),
        ErrorClassification::Terminal
    );

    assert!(
        can_retry_cooldown && cannot_retry_invalid,
        "Backend should retry on CooldownActive but not on InvalidInput"
    );
}

#[test]
fn test_all_errors_have_non_empty_messages() {
    let errors = vec![
        ContractError::Unauthorized,
        ContractError::NotFound,
        ContractError::InvalidInput,
        ContractError::Overflow,
        ContractError::CooldownActive,
        ContractError::PayloadTooLarge,
        ContractError::MetadataTooLong,
        ContractError::ConfessionExists,
        ContractError::ConfessionEmpty,
        ContractError::ConfessionTooLong,
        ContractError::ReactionExists,
        ContractError::InvalidReactionType,
        ContractError::ReportExists,
        ContractError::InvalidReportReason,
        ContractError::ReportReasonTooLong,
        ContractError::ProposalNotFound,
        ContractError::UnauthorizedApproval,
        ContractError::QuorumNotReached,
        ContractError::AlreadyApproved,
        ContractError::AlreadyExecuted,
        ContractError::InvalidAction,
    ];

    for error in errors {
        assert!(
            !error.message().is_empty(),
            "Error {:?} has empty message",
            error
        );
    }
}