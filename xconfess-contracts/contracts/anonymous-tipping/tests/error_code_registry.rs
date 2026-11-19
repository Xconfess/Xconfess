//! Stable error-code registry checks for the anonymous-tipping contract
//! (issue #2211).
//!
//! `CONTRACT_ERROR_CODES.md` is the registry that backend and frontend
//! consumers read. These tests keep the contract, the `codes` constants, and
//! that document in step:
//! - every `Error` variant maps to a unique 6xxx code equal to `6000 + discriminant`
//! - each code's name and classification match its documented row
//! - messages are safe to show users: no panic text, no Rust paths

#![cfg(test)]

use anonymous_tipping::{codes, Error, ErrorClassification};

const REGISTRY_MD: &str = include_str!("../../../CONTRACT_ERROR_CODES.md");

/// Every tipping error: variant, public `codes` constant, and registry name.
const REGISTRY: [(Error, u32, &str); 12] = [
    (
        Error::InvalidTipAmount,
        codes::INVALID_TIP_AMOUNT,
        "INVALID_TIP_AMOUNT",
    ),
    (
        Error::MetadataTooLong,
        codes::METADATA_TOO_LONG,
        "METADATA_TOO_LONG",
    ),
    (
        Error::TotalOverflow,
        codes::TOTAL_OVERFLOW,
        "TOTAL_OVERFLOW",
    ),
    (
        Error::NonceOverflow,
        codes::NONCE_OVERFLOW,
        "NONCE_OVERFLOW",
    ),
    (Error::Unauthorized, codes::UNAUTHORIZED, "UNAUTHORIZED"),
    (
        Error::ContractPaused,
        codes::CONTRACT_PAUSED,
        "CONTRACT_PAUSED",
    ),
    (Error::RateLimited, codes::RATE_LIMITED, "RATE_LIMITED"),
    (
        Error::InvalidRateLimitConfig,
        codes::INVALID_RATE_LIMIT_CONFIG,
        "INVALID_RATE_LIMIT_CONFIG",
    ),
    (
        Error::TokenNotConfigured,
        codes::TOKEN_NOT_CONFIGURED,
        "TOKEN_NOT_CONFIGURED",
    ),
    (
        Error::SettlementReplay,
        codes::SETTLEMENT_REPLAY,
        "SETTLEMENT_REPLAY",
    ),
    (
        Error::SettlementNotFound,
        codes::SETTLEMENT_NOT_FOUND,
        "SETTLEMENT_NOT_FOUND",
    ),
    (
        Error::RecipientMismatch,
        codes::RECIPIENT_MISMATCH,
        "RECIPIENT_MISMATCH",
    ),
];

/// Compile-time coverage: adding an `Error` variant breaks this exhaustive
/// match, which forces a matching row (and a new index) in `REGISTRY`.
fn registry_index(error: Error) -> usize {
    match error {
        Error::InvalidTipAmount => 0,
        Error::MetadataTooLong => 1,
        Error::TotalOverflow => 2,
        Error::NonceOverflow => 3,
        Error::Unauthorized => 4,
        Error::ContractPaused => 5,
        Error::RateLimited => 6,
        Error::InvalidRateLimitConfig => 7,
        Error::TokenNotConfigured => 8,
        Error::SettlementReplay => 9,
        Error::SettlementNotFound => 10,
        Error::RecipientMismatch => 11,
    }
}

fn classification_label(class: ErrorClassification) -> &'static str {
    match class {
        ErrorClassification::Terminal => "Terminal",
        ErrorClassification::Retryable => "Retryable",
        ErrorClassification::Unknown => "Unknown",
    }
}

/// Parse tipping rows from `CONTRACT_ERROR_CODES.md`. Each row has the form
/// `| 6001 | \`INVALID_TIP_AMOUNT\` | Terminal | ... | 400 |`.
/// Returns `(code, name, classification)` for each row.
fn documented_rows() -> Vec<(u32, String, String)> {
    REGISTRY_MD
        .lines()
        .filter_map(|line| {
            let cells: Vec<&str> = line.split('|').map(str::trim).collect();
            // Skip the range summary row (`| 6000–6099 | ...`): only a plain
            // code in the tipping range is a registry row.
            let code: u32 = cells.get(1)?.parse().ok()?;
            if !(6000..=6099).contains(&code) {
                return None;
            }
            let name = cells.get(2)?.trim_matches('`').to_string();
            let class = cells.get(3)?.to_string();
            Some((code, name, class))
        })
        .collect()
}

#[test]
fn codes_constants_match_error_code_method() {
    for (error, constant, _) in REGISTRY {
        assert_eq!(
            error.code(),
            constant,
            "Error::{error:?} must map to its codes constant"
        );
    }
}

#[test]
fn codes_follow_6000_plus_discriminant() {
    for (error, _, name) in REGISTRY {
        assert_eq!(
            error.code(),
            6000 + error as u32,
            "{name} must be 6000 + its contract discriminant"
        );
    }
}

#[test]
fn codes_are_unique_and_inside_tipping_range() {
    let mut seen: Vec<u32> = REGISTRY.iter().map(|(error, _, _)| error.code()).collect();
    seen.sort_unstable();
    let total = seen.len();
    seen.dedup();

    assert_eq!(seen.len(), total, "tipping error codes must be unique");
    assert!(
        seen.iter().all(|code| (6001..=6099).contains(code)),
        "tipping error codes must stay inside the 6000-6099 range"
    );
}

#[test]
fn registry_table_is_indexed_by_variant() {
    for (idx, (error, _, _)) in REGISTRY.iter().enumerate() {
        assert_eq!(
            registry_index(*error),
            idx,
            "REGISTRY row order must match registry_index for {error:?}"
        );
    }
}

#[test]
fn documented_registry_matches_codes_names_and_classes() {
    let rows = documented_rows();
    assert_eq!(
        rows.len(),
        REGISTRY.len(),
        "CONTRACT_ERROR_CODES.md must document every tipping error code"
    );

    for (error, code, name) in REGISTRY {
        let row = rows
            .iter()
            .find(|(documented_code, _, _)| *documented_code == code)
            .unwrap_or_else(|| panic!("{name} ({code}) is missing from CONTRACT_ERROR_CODES.md"));

        assert_eq!(row.1, name, "documented name for code {code}");
        assert_eq!(
            row.2,
            classification_label(error.classification()),
            "documented classification for {name}"
        );
    }
}

#[test]
fn messages_are_safe_user_facing_strings() {
    const BANNED: [&str; 9] = [
        "panick", "unwrap", "called `", "::", "src/", ".rs", "0x", "{", "}",
    ];

    for (error, _, name) in REGISTRY {
        let message = error.message();
        assert!(!message.is_empty(), "{name} must have a message");
        assert!(
            message.len() <= 80,
            "{name} message is too long for a user-facing error: {message}"
        );
        for banned in BANNED {
            assert!(
                !message.contains(banned),
                "{name} message `{message}` leaks internal text `{banned}`"
            );
        }
    }
}
