use confession_anchor::errors::{codes, ContractError, ErrorClassification};

/// ============================================================================
/// ERROR CODE → USER-FACING MESSAGE MAPPING TESTS
/// ============================================================================
/// These tests document and validate the contract between on-chain error codes
/// and the user-facing messages that downstream consumers (backend → frontend)
/// should produce. At least one example per major error class is covered.
///
/// The expected user messages must stay in sync with the
/// `mapContractErrorToUserMessage` table in CONTRACT_ERROR_CODES.md.
/// Returns the expected user-facing message for a given contract error code.
/// This mirrors the frontend lookup table documented in CONTRACT_ERROR_CODES.md.
fn expected_user_message(code: u32) -> &'static str {
    match code {
        // Global/Common (1000-series)
        1000 => "You are not authorized to perform this action.",
        1001 => "The requested item could not be found.",
        1002 => "The input provided is invalid. Please check and try again.",
        1004 => "You're doing that too fast. Please wait a moment and try again.",
        1005 => "The content is too large. Please reduce the size and try again.",
        // Confession (2000-series)
        2000 => "This confession has already been submitted.",
        2001 => "Confession cannot be empty. Please write something.",
        2002 => "Your confession exceeds the maximum length. Please shorten it and try again.",
        // Reaction (3000-series)
        3000 => "You have already reacted to this confession.",
        3001 => "Invalid reaction type selected.",
        // Report (4000-series)
        4000 => "You have already reported this confession. Our team will review it.",
        4001 => "Please select a valid reason for your report.",
        // Governance (5000-series)
        5003 => "You have already approved this proposal.",
        5004 => "This proposal has already been executed.",
        _ => "An unexpected error occurred.",
    }
}

// ── Global/Common error class ────────────────────────────────────────────────

#[test]
fn global_cooldown_maps_to_user_message() {
    let error = ContractError::CooldownActive;
    assert_eq!(error.code(), codes::COOLDOWN_ACTIVE);
    assert_eq!(error.classification(), ErrorClassification::Retryable);

    let msg = expected_user_message(error.code());
    assert!(
        msg.contains("too fast"),
        "CooldownActive user message should tell the user to slow down"
    );
}

#[test]
fn global_unauthorized_maps_to_user_message() {
    let error = ContractError::Unauthorized;
    assert_eq!(error.code(), codes::UNAUTHORIZED);
    assert_eq!(error.classification(), ErrorClassification::Terminal);

    let msg = expected_user_message(error.code());
    assert!(
        msg.contains("not authorized"),
        "Unauthorized user message should indicate permission denial"
    );
}

// ── Confession error class ──────────────────────────────────────────────────

#[test]
fn confession_too_long_maps_to_user_message() {
    let error = ContractError::ConfessionTooLong;
    assert_eq!(error.code(), codes::CONFESSION_TOO_LONG);
    assert_eq!(error.classification(), ErrorClassification::Terminal);

    let msg = expected_user_message(error.code());
    assert!(
        msg.contains("maximum length"),
        "ConfessionTooLong user message should reference length limit"
    );
}

#[test]
fn confession_empty_maps_to_user_message() {
    let error = ContractError::ConfessionEmpty;
    assert_eq!(error.code(), codes::CONFESSION_EMPTY);
    assert_eq!(error.classification(), ErrorClassification::Terminal);

    let msg = expected_user_message(error.code());
    assert!(
        msg.contains("empty"),
        "ConfessionEmpty user message should tell user to write something"
    );
}

// ── Reaction error class ────────────────────────────────────────────────────

#[test]
fn reaction_exists_maps_to_user_message() {
    let error = ContractError::ReactionExists;
    assert_eq!(error.code(), codes::REACTION_EXISTS);
    assert_eq!(error.classification(), ErrorClassification::Terminal);

    let msg = expected_user_message(error.code());
    assert!(
        msg.contains("already reacted"),
        "ReactionExists user message should indicate duplicate"
    );
}

// ── Report error class ──────────────────────────────────────────────────────

#[test]
fn report_exists_maps_to_user_message() {
    let error = ContractError::ReportExists;
    assert_eq!(error.code(), codes::REPORT_EXISTS);
    assert_eq!(error.classification(), ErrorClassification::Terminal);

    let msg = expected_user_message(error.code());
    assert!(
        msg.contains("already reported"),
        "ReportExists user message should indicate duplicate report"
    );
}

// ── Governance error class ──────────────────────────────────────────────────

#[test]
fn already_approved_maps_to_user_message() {
    let error = ContractError::AlreadyApproved;
    assert_eq!(error.code(), codes::ALREADY_APPROVED);
    assert_eq!(error.classification(), ErrorClassification::Terminal);

    let msg = expected_user_message(error.code());
    assert!(
        msg.contains("already approved"),
        "AlreadyApproved user message should indicate duplicate approval"
    );
}

// ── Coverage: every major error class has a mapping ─────────────────────────

#[test]
fn each_major_error_class_has_user_message_mapping() {
    let class_representatives: Vec<(ContractError, u32, &str)> = vec![
        (ContractError::Unauthorized, 1000, "Global/Common"),
        (ContractError::ConfessionEmpty, 2001, "Confession"),
        (ContractError::ReactionExists, 3000, "Reaction"),
        (ContractError::ReportExists, 4000, "Report"),
        (ContractError::AlreadyApproved, 5003, "Governance"),
    ];

    for (error, expected_code, class_name) in class_representatives {
        let code = error.code();
        assert_eq!(
            code, expected_code,
            "{} class representative has wrong code",
            class_name
        );

        let msg = expected_user_message(code);
        assert_ne!(
            msg, "An unexpected error occurred.",
            "{} class (code {}) is missing a user-facing message mapping",
            class_name, code
        );
    }
}
